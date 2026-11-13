import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { FamilyService } from './family.service';
import { AdminService } from './admin.service';

describe('AppComponent', () => {
  let adminStub: { isAdmin: boolean; checkSession: () => unknown; logout: () => void };

  beforeEach(async () => {
    adminStub = { isAdmin: true, checkSession: () => of(true), logout: () => { adminStub.isAdmin = false; } };
    const familyService = jasmine.createSpyObj<FamilyService>('FamilyService', ['getTrees']);
    familyService.getTrees.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: FamilyService, useValue: familyService },
        { provide: AdminService, useValue: adminStub }
      ]
    }).compileComponents();
  });

  it('creates a family workspace when no trees exist', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Every family has');
    expect(fixture.nativeElement.textContent).toContain('Create your family tree');
  });

  describe('family member helpers', () => {
    const person = (id: string, name: string) => ({ _id: id, treeId: 't', name });

    it('finds people by name, case-insensitively', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.people = [person('1', 'Ramesh Mohanty'), person('2', 'Sita Mohanty'), person('3', 'Gopal Das')];
      component.searchTerm = 'mohanty';
      expect(component.searchResults.map((p) => p._id)).toEqual(['1', '2']);
      component.searchTerm = '  ';
      expect(component.searchResults).toEqual([]);
    });

    it('offers only unrelated people as link candidates', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      const [me, dad, brother, other] = [person('1', 'Me'), person('2', 'Dad'), person('3', 'Brother'), person('4', 'Cousin')];
      component.people = [me, dad, brother, other];
      component.selectedPerson = me;
      component.relatives = { person: me, parents: [dad], siblings: [brother], children: [], spouses: [] };
      expect(component.linkCandidates.map((p) => p.name)).toEqual(['Cousin']);
    });

    it('offers add father/mother only for the missing parent', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      const dad = { ...person('2', 'Dad'), gender: 'Man' };
      component.relatives = { person: null, parents: [dad], siblings: [], children: [], spouses: [] };
      expect(component.canAddFather).toBeFalse();
      expect(component.canAddMother).toBeTrue();

      component.openPersonForm('mother');
      expect(component.modalType).toBe('person');
      expect(component.personForm.gender).toBe('Woman');

      component.modalType = null;
      component.openPersonForm('father');
      expect(component.modalType).toBeNull();
    });

    it('adds a wife for a man, a husband for a woman, with the gender fixed', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.relatives = { person: null, parents: [], siblings: [], children: [], spouses: [] };
      component.selectedPerson = { ...person('1', 'Ramesh'), gender: 'Man' };
      component.openPersonForm('spouse');
      expect(component.relationLabel).toBe('A wife');
      expect(component.personForm.gender).toBe('Woman');

      component.selectedPerson = { ...person('2', 'Sita'), gender: 'Woman' };
      expect(component.spouseWord).toBe('husband');
      expect(component.roleGender).toBe('Man');
    });

    it('defaults the other parent of a new child to the only spouse', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      const wife = { ...person('2', 'Wife'), gender: 'Woman' };
      component.selectedPerson = { ...person('1', 'Husband'), gender: 'Man' };
      component.relatives = { person: null, parents: [], siblings: [], children: [], spouses: [wife] };
      component.openPersonForm('child');
      expect(component.otherParentId).toBe('2');
    });

    it('opens a delete confirmation that lists the links being removed', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.selectedPerson = { ...person('1', 'Ramesh'), photoUrl: '/uploads/x.png' };
      component.relatives = {
        person: null, parents: [person('2', 'Hari')], siblings: [person('5', 'Rina')],
        children: [person('3', 'Arjun'), person('4', 'Priya')], spouses: [person('6', 'Sunita')]
      };
      component.openDeleteConfirm();
      expect(component.modalType).toBe('delete');
      expect(component.deleteImpact).toEqual([
        '1 link to parents (Hari)', '1 marriage (Sunita)', '2 links to children (Arjun, Priya)', 'their photo'
      ]);
    });

    it('asks a non-admin to sign in instead of opening the delete confirmation', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      adminStub.isAdmin = false;
      component.selectedPerson = person('1', 'Ramesh');
      component.openDeleteConfirm();
      expect(component.modalType).toBe('admin');
      expect(component.formError).toContain('Only an admin');
    });

    it('only lets the admin start deleting a family, and needs the family name typed', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.selectedTree = { _id: 't1', name: 'Mohanty Family', village: 'V', surname: 'Mohanty' };

      adminStub.isAdmin = false;
      component.openDeleteTree();
      expect(component.modalType).toBe('admin');

      adminStub.isAdmin = true;
      component.openDeleteTree();
      expect(component.modalType).toBe('deleteTree');
      expect(component.treeNameConfirmed).toBeFalse();
      component.confirmTreeName = 'mohanty';
      expect(component.treeNameConfirmed).toBeFalse();
      component.confirmTreeName = '  mohanty family ';
      expect(component.treeNameConfirmed).toBeTrue();
    });

    it('only lets the admin edit the family name, pre-filled with the current details', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.selectedTree = { _id: 't1', name: 'Mohanty Family', village: 'Bahadalapur', surname: 'Mohanty', state: 'Odisha', country: 'India' };

      adminStub.isAdmin = false;
      component.openEditTree();
      expect(component.modalType).toBe('admin');
      expect(component.formError).toContain('Only an admin');

      adminStub.isAdmin = true;
      component.openEditTree();
      expect(component.modalType).toBe('editTree');
      expect(component.editTreeForm).toEqual({
        name: 'Mohanty Family', surname: 'Mohanty', village: 'Bahadalapur', district: '', state: 'Odisha', country: 'India'
      });
      expect(component.familyLocation(component.selectedTree!)).toBe('Bahadalapur, Odisha, India');

      component.editTreeForm.name = '   ';
      component.saveTree();
      expect(component.formError).toContain('Please fill in');
    });

    it('does not open the sibling form when there are no parents', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.relatives = { person: null, parents: [], siblings: [], children: [], spouses: [] };
      component.openPersonForm('sibling');
      expect(component.modalType).toBeNull();
    });
  });
});
