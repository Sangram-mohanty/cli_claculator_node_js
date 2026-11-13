import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, forkJoin, of, switchMap, throwError } from 'rxjs';
import { FamilyService, FamilyTree, Partnership, Person, PersonInput, PersonRelatives, Relationship } from './family.service';
import { FamilyGraphComponent } from './family-graph/family-graph.component';
import { AdminService } from './admin.service';

type ModalType = 'tree' | 'editTree' | 'person' | 'edit' | 'delete' | 'deleteTree' | 'admin' | null;
type PersonMode = 'new' | 'existing';
type PersonRole = 'root' | 'father' | 'mother' | 'spouse' | 'child' | 'sibling';
type ViewMode = 'branch' | 'graph';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function emptyRelatives(): PersonRelatives {
  return { person: null, parents: [], siblings: [], children: [], spouses: [] };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, FamilyGraphComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  trees: FamilyTree[] = [];
  selectedTree: FamilyTree | null = null;
  people: Person[] = [];
  selectedPerson: Person | null = null;
  relatives: PersonRelatives = emptyRelatives();
  modalType: ModalType = null;
  personRole: PersonRole = 'root';
  loading = true;
  saving = false;
  photoUploading = false;
  errorMessage = '';
  notice = '';
  formError = '';
  detailOpen = true;
  searchTerm = '';
  personMode: PersonMode = 'new';
  existingPersonId = '';
  view: ViewMode = 'branch';
  relationships: Relationship[] = [];
  partnerships: Partnership[] = [];
  /** When adding a child, the selected person's spouse who is the child's other parent ('' for none). */
  otherParentId = '';
  /** Set in the edit form when the person's current photo should be deleted on save. */
  removeCurrentPhoto = false;
  adminPassword = '';
  /** The family name typed to confirm deleting a whole family tree. */
  confirmTreeName = '';
  editTreeForm = { name: '', surname: '', village: '', district: '', state: '', country: '' };
  newPhoto: File | null = null;
  newPhotoPreview = '';
  treeForm = { name: '', surname: '', village: '', district: '', state: '', country: '' };
  personForm: PersonInput = { name: '', gender: '', birthYear: null };
  readonly currentYear = new Date().getFullYear();

  constructor(private readonly familyService: FamilyService, readonly admin: AdminService) {}

  ngOnInit(): void {
    this.loadTrees();
    this.admin.checkSession().subscribe();
  }

  openAdminLogin(): void {
    this.formError = '';
    this.adminPassword = '';
    this.modalType = 'admin';
  }

  signInAdmin(): void {
    if (!this.adminPassword) {
      this.formError = 'Enter the admin password.';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.admin.login(this.adminPassword).subscribe({
      next: () => {
        this.saving = false;
        this.adminPassword = '';
        this.modalType = null;
        this.showNotice('Signed in as admin. You can now delete people, and edit or delete families.');
      },
      error: (error) => {
        this.saving = false;
        this.formError = this.apiError(error, 'Admin sign-in failed.');
      }
    });
  }

  signOutAdmin(): void {
    this.admin.logout();
    if (this.modalType === 'delete') this.modalType = null;
    this.showNotice('Signed out of admin.');
  }

  ngOnDestroy(): void {
    this.clearNewPhoto();
  }

  setView(view: ViewMode): void {
    this.view = view;
    if (view === 'graph') this.loadGraph();
  }

  /** Clicking someone in the graph opens their branch. */
  openFromGraph(personId: string): void {
    const person = this.people.find((candidate) => candidate._id === personId);
    if (!person) return;
    this.view = 'branch';
    this.selectPerson(person);
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
      this.relationships = [];
      this.partnerships = [];
    }
    this.selectedTree = tree;
    this.relatives = emptyRelatives();
    this.loading = true;
    this.familyService.getPeople(tree._id).subscribe({
      next: (people) => {
        this.people = people;
        const current = this.selectedPerson && people.find((person) => person._id === this.selectedPerson?._id);
        this.selectedPerson = current ?? people[0] ?? null;
        this.loading = false;
        if (this.selectedPerson) this.loadRelatives(this.selectedPerson);
        if (this.view === 'graph') this.loadGraph();
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
      ...this.relatives.parents, ...this.relatives.siblings, ...this.relatives.children, ...this.relatives.spouses
    ].map((person) => person._id));
    const requiredGender = this.roleGender;
    return this.people.filter((person) => person._id !== selectedId && !related.has(person._id)
      && (!requiredGender || !person.gender || person.gender === requiredGender));
  }

  get canAddSibling(): boolean {
    return this.relatives.parents.length > 0;
  }

  get father(): Person | undefined {
    return this.relatives.parents.find((parent) => parent.gender === 'Man');
  }

  get mother(): Person | undefined {
    return this.relatives.parents.find((parent) => parent.gender === 'Woman');
  }

  get canAddFather(): boolean {
    return !this.father && this.relatives.parents.length < 2;
  }

  get canAddMother(): boolean {
    return !this.mother && this.relatives.parents.length < 2;
  }

  /** Father and mother forms fix the gender, and a wife or husband is the opposite of the selected person. */
  get roleGender(): string {
    if (this.personRole === 'father') return 'Man';
    if (this.personRole === 'mother') return 'Woman';
    if (this.personRole === 'spouse') {
      const gender = this.selectedPerson?.gender;
      return gender === 'Man' ? 'Woman' : gender === 'Woman' ? 'Man' : '';
    }
    return '';
  }

  /** "wife", "husband", or "spouse", depending on the selected person's gender. */
  get spouseWord(): string {
    const gender = this.selectedPerson?.gender;
    return gender === 'Man' ? 'wife' : gender === 'Woman' ? 'husband' : 'spouse';
  }

  spouseLabel(spouse: Person): string {
    return spouse.gender === 'Woman' ? 'Wife' : spouse.gender === 'Man' ? 'Husband' : 'Spouse';
  }

  openTreeForm(): void {
    // Always start with an empty form for a new family.
    this.treeForm = { name: '', surname: '', village: '', district: '', state: '', country: '' };
    this.formError = '';
    this.modalType = 'tree';
  }

  openPersonForm(role: PersonRole): void {
    if (role === 'sibling' && !this.canAddSibling) return;
    if (role === 'father' && !this.canAddFather) return;
    if (role === 'mother' && !this.canAddMother) return;
    this.formError = '';
    this.personRole = role;
    this.personMode = 'new';
    this.existingPersonId = '';
    this.personForm = { name: '', gender: this.roleGender, birthYear: null };
    this.otherParentId = role === 'child' && this.relatives.spouses.length === 1 ? this.relatives.spouses[0]._id : '';
    this.clearNewPhoto();
    this.modalType = 'person';
  }

  chooseNewPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      this.formError = 'Choose a JPEG, PNG, or WebP photo.';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.formError = 'Photo must be 5 MB or smaller.';
      return;
    }
    this.formError = '';
    this.clearNewPhoto();
    this.newPhoto = file;
    this.newPhotoPreview = URL.createObjectURL(file);
  }

  clearNewPhoto(): void {
    if (this.newPhotoPreview) URL.revokeObjectURL(this.newPhotoPreview);
    this.newPhoto = null;
    this.newPhotoPreview = '';
  }

  openEditForm(): void {
    if (!this.selectedPerson) return;
    this.formError = '';
    this.personForm = {
      name: this.selectedPerson.name,
      gender: this.selectedPerson.gender ?? '',
      birthYear: this.selectedPerson.birthYear ?? null
    };
    this.clearNewPhoto();
    this.removeCurrentPhoto = false;
    this.modalType = 'edit';
  }

  /** The photo shown in the edit form: a newly chosen one, the current one, or none if it is being removed. */
  get editPhotoPreview(): string {
    if (this.newPhotoPreview) return this.newPhotoPreview;
    const current = this.selectedPerson?.photoUrl;
    return current && !this.removeCurrentPhoto ? this.photoUrl(current) : '';
  }

  markPhotoForRemoval(): void {
    this.clearNewPhoto();
    this.removeCurrentPhoto = true;
  }

  closeModal(): void {
    if (this.saving) return;
    this.modalType = null;
    this.clearNewPhoto();
  }

  get relationLabel(): string {
    return ({
      root: 'A family member', father: 'A father', mother: 'A mother', spouse: `A ${this.spouseWord}`,
      child: 'A child', sibling: 'A sibling'
    })[this.personRole];
  }

  openEditTree(): void {
    if (!this.selectedTree) return;
    if (!this.admin.isAdmin) {
      this.openAdminLogin();
      this.formError = 'Only an admin can edit the family name. Sign in as admin to continue.';
      return;
    }
    const { name, surname, village, district = '', state = '', country = '' } = this.selectedTree;
    this.editTreeForm = { name, surname, village, district, state, country };
    this.formError = '';
    this.modalType = 'editTree';
  }

  saveTree(): void {
    if (!this.selectedTree) return;
    const form = this.cleanFamilyForm(this.editTreeForm);
    if (!form) return;
    const treeId = this.selectedTree._id;
    this.saving = true;
    this.formError = '';
    this.familyService.updateTree(treeId, form).subscribe({
      next: (tree) => {
        this.saving = false;
        this.modalType = null;
        this.trees = this.trees.map((existing) => existing._id === treeId ? tree : existing);
        if (this.selectedTree?._id === treeId) this.selectedTree = tree;
        this.showNotice('The family details were updated.');
      },
      error: (error) => {
        this.saving = false;
        if (error?.status === 401) this.admin.logout();
        this.formError = this.apiError(error, 'The family details could not be saved.');
      }
    });
  }

  openDeleteTree(): void {
    if (!this.selectedTree) return;
    if (!this.admin.isAdmin) {
      this.openAdminLogin();
      this.formError = 'Only an admin can delete a family. Sign in as admin to continue.';
      return;
    }
    this.formError = '';
    this.confirmTreeName = '';
    this.modalType = 'deleteTree';
  }

  get treeNameConfirmed(): boolean {
    // Ignore capital letters and extra spaces so only the words themselves have to match.
    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
    return !!this.selectedTree && normalize(this.confirmTreeName) === normalize(this.selectedTree.name);
  }

  deleteSelectedTree(): void {
    if (!this.selectedTree || !this.treeNameConfirmed) return;
    const removed = this.selectedTree;
    this.saving = true;
    this.formError = '';
    this.familyService.deleteTree(removed._id).subscribe({
      next: () => {
        this.saving = false;
        this.modalType = null;
        this.confirmTreeName = '';
        this.trees = this.trees.filter((tree) => tree._id !== removed._id);
        this.selectedTree = null;
        this.selectedPerson = null;
        this.people = [];
        this.relationships = [];
        this.partnerships = [];
        this.relatives = emptyRelatives();
        this.showNotice(`The ${removed.name} family tree was deleted.`);
        if (this.trees.length) this.selectTree(this.trees[0]);
      },
      error: (error) => {
        this.saving = false;
        if (error?.status === 401) this.admin.logout();
        this.formError = this.apiError(error, 'This family could not be deleted.');
      }
    });
  }

  /** "Village, District, State, Country" for a family, skipping parts that are not filled in. */
  familyLocation(tree: FamilyTree): string {
    return [tree.village, tree.district, tree.state, tree.country].map((part) => part?.trim()).filter(Boolean).join(', ');
  }

  /** Trims the family form and checks every field is filled in; shows a message and returns null if not. */
  private cleanFamilyForm(form: typeof this.treeForm): typeof this.treeForm | null {
    const clean = {
      name: form.name.trim(), surname: form.surname.trim(), village: form.village.trim(),
      district: form.district.trim(), state: form.state.trim(), country: form.country.trim()
    };
    const missing = ([['family name', clean.name], ['surname', clean.surname], ['village', clean.village],
      ['district', clean.district], ['state', clean.state], ['country', clean.country]] as const)
      .filter(([, value]) => !value).map(([label]) => label);
    if (missing.length) {
      this.formError = `Please fill in the ${missing.length === 1 ? missing[0] : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1]}.`;
      return null;
    }
    return clean;
  }

  createTree(): void {
    const tree = this.cleanFamilyForm(this.treeForm);
    if (!tree) return;
    this.saving = true;
    this.formError = '';
    this.familyService.createTree(tree).subscribe({
      next: (tree) => {
        this.trees = [...this.trees, tree];
        this.selectedTree = tree;
        this.people = [];
        this.relationships = [];
        this.partnerships = [];
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
    const photo = this.newPhoto;
    const isParent = this.personRole === 'father' || this.personRole === 'mother' || this.personRole === 'spouse';
    this.familyService.createPerson(treeId, { ...this.personForm, gender: this.roleGender || this.personForm.gender }).subscribe({
      next: (person) => {
        // After adding a father, mother, or spouse, stay on the selected person so they can keep building.
        const focusId = isParent && this.selectedPerson ? this.selectedPerson._id : person._id;
        this.linkPerson(treeId, person._id).subscribe({
          next: () => {
            if (!photo) {
              this.finishPersonForm(focusId);
              return;
            }
            this.familyService.uploadPhoto(treeId, person._id, photo).subscribe({
              next: () => this.finishPersonForm(focusId),
              error: (error) => {
                this.finishPersonForm(focusId);
                this.showNotice(`${person.name} was added, but the photo could not be uploaded: ${this.apiError(error, 'unknown error')}`);
              }
            });
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

  private finishPersonForm(focusId: string): void {
    this.modalType = null;
    this.saving = false;
    this.clearNewPhoto();
    this.refreshPeople(focusId);
  }

  updatePerson(): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    if (!this.personForm.name.trim()) {
      this.formError = 'Please enter a name.';
      return;
    }
    this.saving = true;
    this.formError = '';
    const treeId = this.selectedTree._id;
    const personId = this.selectedPerson._id;
    const photo = this.newPhoto;
    const removePhoto = this.removeCurrentPhoto && !photo && !!this.selectedPerson.photoUrl;
    this.familyService.updatePerson(treeId, personId, this.personForm).pipe(
      switchMap((person) => photo
        ? this.familyService.uploadPhoto(treeId, personId, photo)
        : removePhoto ? this.familyService.removePhoto(treeId, personId) : of(person))
    ).subscribe({
      next: (person) => {
        this.modalType = null;
        this.saving = false;
        this.clearNewPhoto();
        this.removeCurrentPhoto = false;
        this.refreshPeople(person._id);
      },
      error: (error) => {
        this.formError = this.apiError(error, 'The changes could not be saved.');
        this.saving = false;
      }
    });
  }

  /** Opens the delete confirmation for the selected person (also reachable from the edit form). */
  openDeleteConfirm(): void {
    if (!this.selectedPerson) return;
    if (!this.admin.isAdmin) {
      this.openAdminLogin();
      this.formError = 'Only an admin can delete people. Sign in as admin to continue.';
      return;
    }
    this.formError = '';
    this.modalType = 'delete';
  }

  /** Plain-language list of the links that deleting the selected person also removes. */
  get deleteImpact(): string[] {
    const r = this.relatives;
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const lines: string[] = [];
    if (r.parents.length) lines.push(`${count(r.parents.length, 'link', 'links')} to parents (${r.parents.map((p) => p.name).join(', ')})`);
    if (r.spouses.length) lines.push(`${count(r.spouses.length, 'marriage', 'marriages')} (${r.spouses.map((p) => p.name).join(', ')})`);
    if (r.children.length) lines.push(`${count(r.children.length, 'link', 'links')} to children (${r.children.map((p) => p.name).join(', ')})`);
    if (this.selectedPerson?.photoUrl) lines.push('their photo');
    return lines;
  }

  deleteSelectedPerson(): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    const removed = this.selectedPerson;
    const fallback = this.relatives.spouses[0] ?? this.relatives.parents[0] ?? this.relatives.children[0] ?? this.relatives.siblings[0];
    this.saving = true;
    this.formError = '';
    this.familyService.deletePerson(this.selectedTree._id, removed._id).subscribe({
      next: () => {
        this.saving = false;
        this.modalType = null;
        this.selectedPerson = null;
        this.showNotice(`${removed.name} was removed from the family tree.`);
        this.refreshPeople(fallback?._id ?? '');
      },
      error: (error) => {
        this.saving = false;
        if (error?.status === 401) this.admin.logout();
        this.formError = this.apiError(error, 'This person could not be deleted.');
      }
    });
  }

  unlink(relative: Person, relation: 'parent' | 'child' | 'spouse'): void {
    if (!this.selectedTree || !this.selectedPerson) return;
    const selected = this.selectedPerson;
    const treeId = this.selectedTree._id;
    const request$ = relation === 'spouse'
      ? this.familyService.removePartnership(treeId, selected._id, relative._id)
      : relation === 'parent'
        ? this.familyService.removeRelationship(treeId, relative._id, selected._id)
        : this.familyService.removeRelationship(treeId, selected._id, relative._id);
    request$.subscribe({
      next: () => {
        this.loadRelatives(selected);
        if (this.view === 'graph') this.loadGraph();
      },
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

  readonly photoUrlFn = (path: string) => this.familyService.photoUrl(path);

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
    const existing = this.people.find((person) => person._id === this.existingPersonId);
    const gender = this.roleGender;
    const setGender$: Observable<unknown> = existing && gender && !existing.gender
      ? this.familyService.updatePerson(treeId, existing._id, {
        name: existing.name, gender, birthYear: existing.birthYear ?? null
      })
      : of(null);
    setGender$.pipe(switchMap(() => this.linkPerson(treeId, this.existingPersonId))).subscribe({
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
    if (this.personRole === 'father' || this.personRole === 'mother') {
      // If the other parent is already known, record the two parents as married.
      const otherParent = this.relatives.parents.find((parent) => parent._id !== personId);
      const alreadyMarried = otherParent && this.partnerships.some((pair) =>
        (pair.personA === otherParent._id && pair.personB === personId) || (pair.personB === otherParent._id && pair.personA === personId));
      const link$ = this.familyService.addRelationship(treeId, personId, selectedId);
      if (!otherParent || alreadyMarried || this.relatives.parents.length !== 1) return link$;
      // The marriage is a convenience; if it already exists (or fails), keep the parent link that was saved.
      return link$.pipe(switchMap(() => this.familyService.addPartnership(treeId, otherParent._id, personId)
        .pipe(catchError(() => of(null)))));
    }
    if (this.personRole === 'spouse') return this.familyService.addPartnership(treeId, selectedId, personId);
    if (this.personRole === 'child') {
      const link$ = this.familyService.addRelationship(treeId, selectedId, personId);
      const otherParentId = this.otherParentId;
      if (!otherParentId) return link$;
      return link$.pipe(switchMap(() => this.familyService.addRelationship(treeId, otherParentId, personId)));
    }
    const parentIds = this.relatives.parents.map((parent) => parent._id);
    if (!parentIds.length) return throwError(() => new Error('Add a parent before adding a sibling.'));
    return this.familyService.addRelationships(treeId, parentIds, personId);
  }

  private showNotice(message: string): void {
    this.notice = message;
  }

  private loadGraph(): void {
    if (!this.selectedTree) return;
    const treeId = this.selectedTree._id;
    forkJoin([this.familyService.getRelationships(treeId), this.familyService.getPartnerships(treeId)]).subscribe({
      next: ([relationships, partnerships]) => {
        if (this.selectedTree?._id !== treeId) return;
        this.relationships = relationships;
        this.partnerships = partnerships;
      },
      error: (error) => this.showNotice(this.apiError(error, 'The family graph could not be loaded.'))
    });
  }

  private refreshPeople(focusId: string): void {
    if (!this.selectedTree) return;
    if (this.view === 'graph') this.loadGraph();
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
          this.relatives = emptyRelatives();
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
