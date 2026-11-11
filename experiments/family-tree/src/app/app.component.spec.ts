import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { FamilyService } from './family.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    const familyService = jasmine.createSpyObj<FamilyService>('FamilyService', ['getTrees']);
    familyService.getTrees.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: FamilyService, useValue: familyService }]
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
      component.relatives = { person: me, parents: [dad], siblings: [brother], children: [] };
      expect(component.linkCandidates.map((p) => p.name)).toEqual(['Cousin']);
    });

    it('does not open the sibling form when there are no parents', () => {
      const component = TestBed.createComponent(AppComponent).componentInstance;
      component.relatives = { person: null, parents: [], siblings: [], children: [] };
      component.openPersonForm('sibling');
      expect(component.modalType).toBeNull();
    });
  });
});
