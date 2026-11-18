import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

const STORAGE_KEY = 'roots-admin-token';

/**
 * Tracks whether this browser is signed in as the family-tree admin. Only the admin may delete
 * people; the server enforces this, and the UI hides delete buttons for everyone else.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiUrl = 'http://localhost:3000/api/v1/admin';
  private token = '';

  constructor(private readonly http: HttpClient) {
    this.token = this.readStored();
  }

  get isAdmin(): boolean {
    return Boolean(this.token);
  }

  /** Dedicated header for admin-only requests, separate from the family-account token. */
  authHeaders(): HttpHeaders {
    return this.token ? new HttpHeaders({ 'X-Admin-Token': this.token }) : new HttpHeaders();
  }

  login(password: string): Observable<void> {
    return this.http.post<{ token: string }>(`${this.apiUrl}/login`, { password }).pipe(
      tap(({ token }) => this.store(token)),
      map(() => undefined)
    );
  }

  checkSession(): Observable<boolean> {
    if (!this.token) return of(false);
    return this.http.get<{ admin: boolean }>(`${this.apiUrl}/session`, { headers: this.authHeaders() }).pipe(
      map(({ admin }) => admin),
      catchError((error) => {
        if (error?.status === 401 || error?.status === 403) return of(false);
        return throwError(() => error);
      }),
      tap((isAdmin) => { if (!isAdmin) this.logout(); })
    );
  }

  logout(): void {
    this.store('');
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
