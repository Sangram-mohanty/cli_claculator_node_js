import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';

export interface AccountUser {
  id: string;
  email: string;
}

interface AuthResponse {
  token: string;
  user: AccountUser;
}

const STORAGE_KEY = 'roots-account-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = 'http://localhost:3000/api/v1/';
  private token = '';
  user: AccountUser | null = null;

  constructor(private readonly http: HttpClient) {
    try {
      this.token = localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      this.token = '';
    }
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  authHeaders(): HttpHeaders {
    return this.token ? new HttpHeaders({ Authorization: `Bearer ${this.token}` }) : new HttpHeaders();
  }

  signUp(email: string, password: string): Observable<void> {
    return this.http.post<AuthResponse>(`${this.apiUrl}auth/signup`, { email, password }).pipe(
      tap((response) => this.store(response)),
      map(() => undefined)
    );
  }

  signIn(email: string, password: string): Observable<void> {
    return this.http.post<AuthResponse>(`${this.apiUrl}auth/login`, { email, password }).pipe(
      tap((response) => this.store(response)),
      map(() => undefined)
    );
  }

  checkSession(): Observable<AccountUser> {
    return this.http.get<{ user: AccountUser }>(`${this.apiUrl}auth/session`, { headers: this.authHeaders() }).pipe(
      tap(({ user }) => { this.user = user; }),
      map(({ user }) => user)
    );
  }

  signOut(): void {
    this.token = '';
    this.user = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The session is cleared in memory even when browser storage is unavailable.
    }
  }

  private store(response: AuthResponse): void {
    this.token = response.token;
    this.user = response.user;
    try {
      localStorage.setItem(STORAGE_KEY, response.token);
    } catch {
      // The session remains active for this page when browser storage is unavailable.
    }
  }
}
