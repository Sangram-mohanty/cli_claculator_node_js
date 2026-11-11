import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';
import { AdminService } from './admin.service';

export interface FamilyTree {
  _id: string;
  name: string;
  village: string;
  district?: string;
  state?: string;
  country?: string;
  surname: string;
}

export interface Person {
  _id: string;
  treeId: string;
  name: string;
  gender?: string;
  birthYear?: number;
  photoUrl?: string;
}

export interface PersonInput {
  name: string;
  gender: string;
  birthYear: number | null;
}

export interface Relationship {
  _id: string;
  parentId: string;
  childId: string;
  type?: string;
}

export interface Partnership {
  _id: string;
  personA: string;
  personB: string;
  type?: string;
}

export interface PersonRelatives {
  person: Person | null;
  parents: Person[];
  siblings: Person[];
  children: Person[];
  spouses: Person[];
}

@Injectable({ providedIn: 'root' })
export class FamilyService {
  private readonly apiUrl = 'http://localhost:3000/api/v1';

  constructor(private readonly http: HttpClient, private readonly admin: AdminService) {}

  getTrees(): Observable<FamilyTree[]> {
    return this.http.get<FamilyTree[]>(`${this.apiUrl}/trees`);
  }

  createTree(tree: Omit<FamilyTree, '_id'>): Observable<FamilyTree> {
    return this.http.post<FamilyTree>(`${this.apiUrl}/trees`, tree);
  }

  /** Admin only: edits the family's details (name, surname, and where they come from). */
  updateTree(treeId: string, tree: Omit<FamilyTree, '_id'>): Observable<FamilyTree> {
    return this.http.patch<FamilyTree>(`${this.apiUrl}/trees/${treeId}`, tree, { headers: this.admin.authHeaders() });
  }

  /** Admin only: deletes the family tree with all of its people, links, marriages, and photos. */
  deleteTree(treeId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/trees/${treeId}`, { headers: this.admin.authHeaders() });
  }

  getPeople(treeId: string): Observable<Person[]> {
    return this.http.get<Person[]>(`${this.apiUrl}/trees/${treeId}/people`);
  }

  createPerson(treeId: string, person: PersonInput): Observable<Person> {
    return this.http.post<Person>(`${this.apiUrl}/trees/${treeId}/people`, person);
  }

  updatePerson(treeId: string, personId: string, person: PersonInput): Observable<Person> {
    return this.http.patch<Person>(`${this.apiUrl}/trees/${treeId}/people/${personId}`, person);
  }

  deletePerson(treeId: string, personId: string): Observable<void> {
    // Admin only: the server refuses this without the admin's sign-in.
    return this.http.delete<void>(`${this.apiUrl}/trees/${treeId}/people/${personId}`, { headers: this.admin.authHeaders() });
  }

  getRelationships(treeId: string): Observable<Relationship[]> {
    return this.http.get<Relationship[]>(`${this.apiUrl}/trees/${treeId}/relationships`);
  }

  getPartnerships(treeId: string): Observable<Partnership[]> {
    return this.http.get<Partnership[]>(`${this.apiUrl}/trees/${treeId}/partnerships`);
  }

  addPartnership(treeId: string, personId: string, partnerId: string): Observable<Partnership> {
    return this.http.post<Partnership>(`${this.apiUrl}/trees/${treeId}/partnerships`, { personId, partnerId });
  }

  removePartnership(treeId: string, personId: string, partnerId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/trees/${treeId}/partnerships/${personId}/${partnerId}`);
  }

  removeRelationship(treeId: string, parentId: string, childId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/trees/${treeId}/relationships/${parentId}/${childId}`);
  }

  addRelationship(treeId: string, parentId: string, childId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/trees/${treeId}/relationships`, { parentId, childId });
  }

  addRelationships(treeId: string, parentIds: string[], childId: string): Observable<unknown> {
    return forkJoin(parentIds.map((parentId) => this.addRelationship(treeId, parentId, childId)));
  }

  getRelatives(treeId: string, personId: string): Observable<PersonRelatives> {
    return this.http.get<PersonRelatives>(`${this.apiUrl}/trees/${treeId}/people/${personId}/relatives`);
  }

  uploadPhoto(treeId: string, personId: string, file: File): Observable<Person> {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<{ person: Person }>(`${this.apiUrl}/trees/${treeId}/people/${personId}/photo`, body)
      .pipe(map((response) => response.person));
  }

  removePhoto(treeId: string, personId: string): Observable<Person> {
    return this.http.delete<{ person: Person }>(`${this.apiUrl}/trees/${treeId}/people/${personId}/photo`)
      .pipe(map((response) => response.person));
  }

  photoUrl(path: string): string {
    return path.startsWith('http') ? path : `http://localhost:3000${path}`;
  }
}
