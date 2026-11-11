import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, throwError } from 'rxjs';
import { FamilyService, FamilyTree, Person, PersonInput, PersonRelatives } from './family.service';

type ModalType = 'tree' | 'person' | 'edit' | null;
type PersonMode = 'new' | 'existing';
type PersonRole = 'root' | 'parent' | 'child' | 'sibling';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  trees: FamilyTree[] = [];
  selectedTree: FamilyTree | null = null;
  people: Person[] = [];
  selectedPerson: Person | null = null;
  relatives: PersonRelatives = { person: null, parents: [], siblings: [], children: [] };
  modalType: ModalType = null;
  personRole: PersonRole = 'root';
  loading = true;
  saving = false;
  photoUploading = false;
  errorMessage = '';
  notice = '';
  formError = '';
  detailOpen = true;
  confirmingDelete = false;
  searchTerm = '';
  personMode: PersonMode = 'new';
  existingPersonId = '';
  treeForm = { name: 'Bahadalapur Mohanty Family', village: 'Bahadalapur', surname: 'Mohanty' };
  personForm: PersonInput = { name: '', gender: '', birthYear: null };
  readonly currentYear = new Date().getFullYear();

  constructor(private readonly familyService: FamilyService) {}

  ngOnInit(): void {
    this.loadTrees();
  }

  loadTrees(): void {
    this.loading = true;
    this.errorMessage = '';
    this.familyService.getTrees().subscribe({
      next: (trees) => {
        this.trees = trees;
        if (trees.length) {
          this.selectTree(trees[0]);
        } else {
          this.selectedTree = null;
          this.people = [];
          this.selectedPerson = null;
          this.loading = false;
        }
      },
      error: (error) => {
        this.errorMessage = this.apiError(error, 'The family service could not be reached.');
        this.loading = false;
      }
    });
  }

  selectTree(tree: FamilyTree): void {
    if (this.selectedTree?._id !== tree._id) {
      this.selectedPerson = null;
      this.searchTerm = '';
    }
    this.selectedTree = tree;
    this.relatives = { person: null, parents: [], siblings: [], children: [] };
    this.loading = true;
    this.familyService.getPeople(tree._id).subscribe({
      next: (people) => {
        this.people = people;
        const current = this.selectedPerson && people.find((person) => person._id === this.selectedPerson?._id);
        this.selectedPerson = current ?? people[0] ?? null;
        this.loading = false;
        if (this.selectedPerson) this.loadRelatives(this.selectedPerson);
      },
      error: (error) => {
        this.errorMessage = this.apiError(error, 'People in this family could not be loaded.');
        this.loading = false;
      }
    });
  }

  selectPerson(person: Person): void {
    this.selectedPerson = person;
    this.detailOpen = true;
    this.confirmingDelete = false;
    this.searchTerm = '';
    this.loadRelatives(person);
  }

  get searchResults(): Person[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return [];
    return this.people.filter((person) => person.name.toLowerCase().includes(term)).slice(0, 8);
  }

  /** People who could be linked to the selected person for the current role. */
  get linkCandidates(): Person[] {
    const selectedId = this.selectedPerson?._id;
    const related = new Set([
      ...this.relatives.parents, ...this.relatives.siblings, ...this.relatives.children
    ].map((person) => person._id));
    return this.people.filter((person) => person._id !== selectedId && !related.has(person._id));
  }

  get canAddSibling(): boolean {
    return this.relatives.parents.length > 0;
  }

  openTreeForm(): void {
    this.formError = '';
    this.modalType = 'tree';
  }

  openPersonForm(role: PersonRole): void {
    if (role === 'sibling' && !this.canAddSibling) return;
    this.formError = '';
    this.personRole = role;
    this.personMode = 'new';
    this.existingPersonId = '';
    this.personForm = { name: '', gender: '', birthYear: null };
    this.modalType = 'person';
  }

  openEditForm(): void {
    if (!this.selectedPerson) return;
    this.formError = '';
    this.personForm = {
      name: this.selectedPerson.name,
      gender: this.selectedPerson.gender ?? '',
      birthYear: this.selectedPerson.birthYear ?? null
    };
    this.modalType = 'edit';
  }

  closeModal(): void {
    if (!this.saving) this.modalType = null;
  }

  get relationLabel(): string {
    return ({ root: 'A family member', parent: 'A parent', child: 'A child', sibling: 'A sibling' })[this.personRole];
  }

  createTree(): void {
    this.saving = true;
    this.formError = '';
    this.familyService.createTree(this.treeForm).subscribe({
      next: (tree) => {
        this.trees = [...this.trees, tree];
        this.selectedTree = tree;
        this.people = [];
        this.selectedPerson = null;
        this.modalType = null;
        this.saving = false;
      },
      error: (error) => {
        this.formError = this.apiError(error, 'The family tree could not be created.');
        this.saving = false;
      }
    });
  }

  createPerson(): void {
    if (!this.selectedTree) return;
    if (this.personMode === 'existing' && this.personRole !== 'root') {
      this.linkExistingPerson();
      return;
    }
    if (!this.personForm.name.trim()) {
      this.formError = 'Please enter a name.';
      return;
    }
    this.saving = true;
    this.formError = '';
    const treeId = this.selectedTree._id;
    this.familyService.createPerson(treeId, this.personForm).subscribe({
      next: (person) => {
        this.linkPerson(treeId, person._id).subscribe({
          next: () => {
            this.modalType = null;
            this.saving = false;
            this.refreshPeople(person._id);
          },
          error: (error) => {
            this.formError = this.apiError(error, 'The person was created, but the family link could not be saved.');
            this.saving = false;
            this.refreshPeople(person._id);
          }
        });
      },
      error: (error) => {
        this.formError = this.apiError(error, 'The person could not be added.');
        this.saving = false;
      }
    });
  }

  updatePerson(): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    if (!this.personForm.name.trim()) {
      this.formError = 'Please enter a name.';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.familyService.updatePerson(this.selectedTree._id, this.selectedPerson._id, this.personForm).subscribe({
      next: (person) => {
        this.modalType = null;
        this.saving = false;
        this.refreshPeople(person._id);
      },
      error: (error) => {
        this.formError = this.apiError(error, 'The changes could not be saved.');
        this.saving = false;
      }
    });
  }

  deleteSelectedPerson(): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    const removed = this.selectedPerson;
    const fallback = this.relatives.parents[0] ?? this.relatives.children[0] ?? this.relatives.siblings[0];
    this.saving = true;
    this.familyService.deletePerson(this.selectedTree._id, removed._id).subscribe({
      next: () => {
        this.saving = false;
        this.confirmingDelete = false;
        this.selectedPerson = null;
        this.showNotice(`${removed.name} was removed from the family tree.`);
        this.refreshPeople(fallback?._id ?? '');
      },
      error: (error) => {
        this.saving = false;
        this.showNotice(this.apiError(error, 'This person could not be removed.'));
      }
    });
  }

  unlink(relative: Person, relation: 'parent' | 'child'): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    const selected = this.selectedPerson;
    const [parentId, childId] = relation === 'parent'
      ? [relative._id, selected._id]
      : [selected._id, relative._id];
    this.familyService.removeRelationship(this.selectedTree._id, parentId, childId).subscribe({
      next: () => this.loadRelatives(selected),
      error: (error) => this.showNotice(this.apiError(error, 'The connection could not be removed.'))
    });
  }

  dismissNotice(): void {
    this.notice = '';
  }

  uploadPhoto(event: Event): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.photoUploading = true;
    this.familyService.uploadPhoto(this.selectedTree._id, this.selectedPerson._id, file).subscribe({
      next: (person) => {
        this.photoUploading = false;
        this.refreshPeople(person._id);
      },
      error: (error) => {
        this.photoUploading = false;
        this.showNotice(this.apiError(error, 'The photo could not be uploaded.'));
      }
    });
    input.value = '';
  }

  photoUrl(path: string): string {
    return this.familyService.photoUrl(path);
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }

  private loadRelatives(person: Person): void {
    if (!this.selectedTree) return;
    this.familyService.getRelatives(this.selectedTree._id, person._id).subscribe({
      next: (relatives) => {
        this.relatives = relatives;
        this.selectedPerson = relatives.person ?? person;
      },
      error: (error) => {
        this.showNotice(this.apiError(error, 'This family member’s connections could not be loaded.'));
      }
    });
  }

  private linkExistingPerson(): void {
    if (!this.selectedTree) return;
    if (!this.existingPersonId) {
      this.formError = 'Choose someone from the family tree.';
      return;
    }
    const treeId = this.selectedTree._id;
    const focusId = this.selectedPerson?._id ?? this.existingPersonId;
    this.saving = true;
    this.formError = '';
    this.linkPerson(treeId, this.existingPersonId).subscribe({
      next: () => {
        this.modalType = null;
        this.saving = false;
        this.refreshPeople(focusId);
      },
      error: (error) => {
        this.formError = this.apiError(error, 'The family connection could not be saved.');
        this.saving = false;
      }
    });
  }

  /** Connects `personId` to the selected person according to the current role. */
  private linkPerson(treeId: string, personId: string): Observable<unknown> {
    const selectedId = this.selectedPerson?._id;
    if (this.personRole === 'root' || !selectedId) return this.familyService.getPeople(treeId);
    if (this.personRole === 'parent') return this.familyService.addRelationship(treeId, personId, selectedId);
    if (this.personRole === 'child') return this.familyService.addRelationship(treeId, selectedId, personId);
    const parentIds = this.relatives.parents.map((parent) => parent._id);
    if (!parentIds.length) return throwError(() => new Error('Add a parent before adding a sibling.'));
    return this.familyService.addRelationships(treeId, parentIds, personId);
  }

  private showNotice(message: string): void {
    this.notice = message;
  }

  private refreshPeople(focusId: string): void {
    if (!this.selectedTree) return;
    this.familyService.getPeople(this.selectedTree._id).subscribe({
      next: (people) => {
        this.people = people;
        const focus = people.find((person) => person._id === focusId);
        const previous = people.find((person) => person._id === this.selectedPerson?._id);
        const next = focus ?? previous ?? people[0];
        if (next) {
          this.selectPerson(next);
        } else {
          this.selectedPerson = null;
          this.relatives = { person: null, parents: [], siblings: [], children: [] };
        }
      },
      error: (error) => {
        this.showNotice(this.apiError(error, 'The updated family members could not be loaded.'));
      }
    });
  }

  private apiError(error: { error?: { error?: string }; message?: string }, fallback: string): string {
    return error.error?.error ?? error.message ?? fallback;
  }
}
