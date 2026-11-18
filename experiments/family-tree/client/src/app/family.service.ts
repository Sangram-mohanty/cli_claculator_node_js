import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';

export interface FamilyTree {
  _id: string;
  name: string;
  village: string;
  district?: string;
  state?: string;
  country?: string;
  surname: string;
  isDemo?: boolean;
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
  private readonly apiUrl = 'http://localhost:3000/api/v1/';

  constructor(private readonly http: HttpClient, private readonly auth: AuthService, private readonly admin: AdminService) {}

  private readHeaders(): HttpHeaders {
    return this.admin.isAdmin ? this.admin.authHeaders() : this.auth.authHeaders();
  }

  getTrees(): Observable<FamilyTree[]> {
    return this.http.get<FamilyTree[]>(`${this.apiUrl}trees`, { headers: this.readHeaders() });
  }

  createTree(tree: Omit<FamilyTree, '_id'>): Observable<FamilyTree> {
    return this.http.post<FamilyTree>(`${this.apiUrl}trees`, tree, { headers: this.auth.authHeaders() });
  }

  updateTree(treeId: string, tree: Omit<FamilyTree, '_id'>): Observable<FamilyTree> {
    return this.http.patch<FamilyTree>(`${this.apiUrl}trees/${treeId}`, tree, { headers: this.auth.authHeaders() });
  }

  deleteTree(treeId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}trees/${treeId}`, { headers: this.readHeaders() });
  }

  getPeople(treeId: string): Observable<Person[]> {
    return this.http.get<Person[]>(`${this.apiUrl}trees/${treeId}/people`, { headers: this.readHeaders() });
  }

  createPerson(treeId: string, person: PersonInput): Observable<Person> {
    return this.http.post<Person>(`${this.apiUrl}trees/${treeId}/people`, person, { headers: this.auth.authHeaders() });
  }

  updatePerson(treeId: string, personId: string, person: PersonInput): Observable<Person> {
    return this.http.patch<Person>(`${this.apiUrl}trees/${treeId}/people/${personId}`, person, { headers: this.auth.authHeaders() });
  }

  deletePerson(treeId: string, personId: string, headers: HttpHeaders): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}trees/${treeId}/people/${personId}`, { headers });
  }

  getRelationships(treeId: string): Observable<Relationship[]> {
    return this.http.get<Relationship[]>(`${this.apiUrl}trees/${treeId}/relationships`, { headers: this.readHeaders() });
  }

  getPartnerships(treeId: string): Observable<Partnership[]> {
    return this.http.get<Partnership[]>(`${this.apiUrl}trees/${treeId}/partnerships`, { headers: this.readHeaders() });
  }

  addPartnership(treeId: string, personId: string, partnerId: string): Observable<Partnership> {
    return this.http.post<Partnership>(`${this.apiUrl}trees/${treeId}/partnerships`, { personId, partnerId }, { headers: this.auth.authHeaders() });
  }

  removePartnership(treeId: string, personId: string, partnerId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}trees/${treeId}/partnerships/${personId}/${partnerId}`, { headers: this.readHeaders() });
  }

  removeRelationship(treeId: string, parentId: string, childId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}trees/${treeId}/relationships/${parentId}/${childId}`, { headers: this.readHeaders() });
  }

  addRelationship(treeId: string, parentId: string, childId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}trees/${treeId}/relationships`, { parentId, childId }, { headers: this.auth.authHeaders() });
  }

  addRelationships(treeId: string, parentIds: string[], childId: string): Observable<unknown> {
    return forkJoin(parentIds.map((parentId) => this.addRelationship(treeId, parentId, childId)));
  }

  getRelatives(treeId: string, personId: string): Observable<PersonRelatives> {
    return this.http.get<PersonRelatives>(`${this.apiUrl}trees/${treeId}/people/${personId}/relatives`, { headers: this.readHeaders() });
  }

  uploadPhoto(treeId: string, personId: string, file: File): Observable<Person> {
    const body = new FormData();
    body.append('photo', file);
    return this.http.post<{ person: Person }>(`${this.apiUrl}trees/${treeId}/people/${personId}/photo`, body, { headers: this.auth.authHeaders() })
      .pipe(map((response) => response.person));
  }

  removePhoto(treeId: string, personId: string): Observable<Person> {
    return this.http.delete<{ person: Person }>(`${this.apiUrl}trees/${treeId}/people/${personId}/photo`, { headers: this.readHeaders() })
      .pipe(map((response) => response.person));
  }

  photoUrl(path: string): string {
    return path.startsWith('http') ? path : `http://localhost:3000${path}`;
  }
}
