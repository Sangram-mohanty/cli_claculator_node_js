import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { FamilyService } from './family.service';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';

describe('AppComponent', () => {
  let authStub: {
    isAuthenticated: boolean;
    user: { id: string; email: string } | null;
    checkSession: () => unknown;
    signOut: () => void;
    signUp: () => unknown;
    signIn: () => unknown;
  };
  let adminStub: {
    isAdmin: boolean;
    checkSession: jasmine.Spy;
    authHeaders: () => unknown;
    logout: jasmine.Spy;
  };
  let familyServiceStub: jasmine.SpyObj<FamilyService>;

  beforeEach(async () => {
    authStub = {
      isAuthenticated: false,
      user: null,
      checkSession: () => of(null),
      signOut: () => { authStub.isAuthenticated = false; authStub.user = null; },
      signUp: () => of(undefined),
      signIn: () => of(undefined)
    };
    adminStub = {
      isAdmin: false,
      checkSession: jasmine.createSpy('checkSession').and.callFake(() => of(adminStub.isAdmin)),
      authHeaders: () => null,
      logout: jasmine.createSpy('logout').and.callFake(() => { adminStub.isAdmin = false; })
    };
    familyServiceStub = jasmine.createSpyObj<FamilyService>(
      'FamilyService', ['getTrees', 'getRelatives', 'deleteTree', 'removeRelationship', 'removePartnership']
    );
    familyServiceStub.getTrees.and.returnValue(of([]));
    familyServiceStub.getRelatives.and.returnValue(of({ person: null, parents: [], siblings: [], children: [], spouses: [] }));
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: FamilyService, useValue: familyServiceStub },
        { provide: AuthService, useValue: authStub },
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
    expect(fixture.nativeElement.querySelector('.app-footer')?.textContent).toContain('Created by Sangram Mohanty');
  });

  it('restores admin access and hides regular account controls', async () => {
    adminStub.isAdmin = true;
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adminStub.checkSession).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.topbar-actions')?.textContent).toContain('Admin access');
    expect(fixture.nativeElement.querySelector('.topbar-actions')?.textContent).not.toContain('Sign in');
    expect(fixture.nativeElement.querySelector('.topbar-actions')?.textContent).not.toContain('Sign up');
  });

  it('keeps regular account controls for a signed-in user', async () => {
    authStub.isAuthenticated = true;
    authStub.user = { id: 'user-id', email: 'person@example.test' };
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.topbar-actions')?.textContent).toContain('person@example.test');
    expect(fixture.nativeElement.querySelector('.topbar-actions')?.textContent).not.toContain('Admin sign in');
  });

  it('keeps the shared sign-in form for family accounts only', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.topbar-actions')?.textContent).not.toContain('Admin');
    fixture.nativeElement.querySelector('.topbar-actions button')?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.auth-tabs')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Admin sign in');
    expect(fixture.nativeElement.textContent).toContain('Welcome back');
  });

  it('requires admin access before deleting a family or unlinking relatives', () => {
    const component = TestBed.createComponent(AppComponent).componentInstance;
    component.selectedTree = { _id: 't', name: 'Family', village: 'V', surname: 'S' };
    component.selectedPerson = { _id: 'p', treeId: 't', name: 'Person' };
    component.confirmTreeName = 'Family';

    component.openDeleteTree();
    component.deleteSelectedTree();
    component.unlink({ _id: 'relative', treeId: 't', name: 'Relative' }, 'child');

    expect(component.modalType).toBeNull();
    expect(familyServiceStub.deleteTree).not.toHaveBeenCalled();
    expect(familyServiceStub.removeRelationship).not.toHaveBeenCalled();
  });

  it('clears an expired admin session and reloads the guest showcase', () => {
    adminStub.isAdmin = true;
    adminStub.checkSession.and.returnValue(of(true));
    familyServiceStub.getTrees.and.returnValues(
      throwError(() => ({ status: 401 })),
      of([])
    );
    const component = TestBed.createComponent(AppComponent).componentInstance;

    component.loadTrees();

    expect(adminStub.logout).toHaveBeenCalled();
    expect(familyServiceStub.getTrees).toHaveBeenCalledTimes(2);
    expect(component.errorMessage).toBe('');
    expect(component.notice).toContain('admin session has expired');
    expect(component.loading).toBeFalse();
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

    it('counts parent-child and partnership connections from loaded data', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.relationships = [
        { _id: 'r1', parentId: '1', childId: '2' },
        { _id: 'r2', parentId: '2', childId: '3' }
      ];
      component.partnerships = [{ _id: 'p1', personA: '1', personB: '4' }];
      expect(component.connectionCount).toBe(3);
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
      adminStub.isAdmin = true;
      component.selectedTree = { _id: 't', name: 'Family', village: 'V', surname: 'S' };
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

    it('does not allow changes to the public showcase family', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.selectedTree = { _id: 'demo', name: 'Sample', village: 'V', surname: 'S', isDemo: true };
      component.selectedPerson = person('1', 'Ramesh');
      component.openDeleteConfirm();
      component.openEditForm();
      component.openPersonForm('root');
      expect(component.modalType).toBeNull();
    });

    it('opens the read-only details view when a showcase graph person is selected', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      const selected = person('1', 'Ada Meadow');
      component.selectedTree = { _id: 'demo', name: 'Sample', village: 'V', surname: 'S', isDemo: true };
      component.people = [selected];
      component.view = 'graph';

      component.openFromGraph(selected._id);

      expect(component.view).toBe('branch');
      expect(component.selectedPerson?._id).toBe(selected._id);
    });

    it('requires an admin to delete a family, and needs the family name typed', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      adminStub.isAdmin = true;
      component.selectedTree = { _id: 't1', name: 'Mohanty Family', village: 'V', surname: 'Mohanty' };

      component.openDeleteTree();
      expect(component.modalType).toBe('deleteTree');
      expect(component.treeNameConfirmed).toBeFalse();
      component.confirmTreeName = 'mohanty';
      expect(component.treeNameConfirmed).toBeFalse();
      component.confirmTreeName = '  mohanty family ';
      expect(component.treeNameConfirmed).toBeTrue();
    });

    it('opens the family details form with the current details', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.selectedTree = { _id: 't1', name: 'Mohanty Family', village: 'Bahadalapur', surname: 'Mohanty', state: 'Odisha', country: 'India' };

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
