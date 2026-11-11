import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';

export interface FamilyTree {
  _id: string;
  name: string;
  village: string;
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

export interface PersonRelatives {
  person: Person | null;
  parents: Person[];
  siblings: Person[];
  children: Person[];
}

@Injectable({ providedIn: 'root' })
export class FamilyService {
  private readonly apiUrl = 'http://localhost:3000/api/v1';

  constructor(private readonly http: HttpClient) {}

  getTrees(): Observable<FamilyTree[]> {
    return this.http.get<FamilyTree[]>(`${this.apiUrl}/trees`);
  }

  createTree(tree: Omit<FamilyTree, '_id'>): Observable<FamilyTree> {
    return this.http.post<FamilyTree>(`${this.apiUrl}/trees`, tree);
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
    return this.http.delete<void>(`${this.apiUrl}/trees/${treeId}/people/${personId}`);
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

  photoUrl(path: string): string {
    return path.startsWith('http') ? path : `http://localhost:3000${path}`;
  }
}
