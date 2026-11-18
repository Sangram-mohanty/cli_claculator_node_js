import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

const STORAGE_KEY = 'roots-admin-token';

/**
 * Tracks whether this browser is signed in as the family-tree admin. Only the admin may delete
 * people; the server enforces this, and the UI hides delete buttons for everyone else.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiUrl = '/api/v1/admin';
  private token = '';

  constructor(private readonly http: HttpClient) {
    this.token = this.readStored();
  }

  get isAdmin(): boolean {
    return Boolean(this.token);
  }

  /** Authorization header for admin-only requests. */
  authHeaders(): HttpHeaders {
    return this.token ? new HttpHeaders({ Authorization: `Bearer ${this.token}` }) : new HttpHeaders();
  }

  login(password: string): Observable<void> {
    return this.http.post<{ token: string }>(`${this.apiUrl}/login`, { password }).pipe(
      tap(({ token }) => this.store(token)),
      map(() => undefined)
    );
  }

  logout(): void {
    this.store('');
  }

  /** Confirms a remembered sign-in is still valid (e.g. not expired); forgets it otherwise. */
  checkSession(): Observable<boolean> {
    if (!this.token) return of(false);
    return this.http.get<{ admin: boolean }>(`${this.apiUrl}/session`, { headers: this.authHeaders() }).pipe(
      map(({ admin }) => admin),
      catchError(() => of(this.isAdmin)),
      tap((admin) => { if (!admin) this.logout(); })
    );
  }

  private store(token: string): void {
    this.token = token;
    try {
      if (token) localStorage.setItem(STORAGE_KEY, token);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode); the sign-in then lasts for this page only.
    }
  }

  private readStored(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }
}
