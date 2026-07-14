import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';

jest.mock('@angular/fire/auth', () => ({ Auth: class {} }));
jest.mock('@angular/fire/firestore', () => ({ Firestore: class {} }));

import { AuthService } from '../auth/auth.service';
import { approvedGuard, pendingOnlyGuard } from './approval.guard';

type Claims = Record<string, unknown>;

function run(
  guard: typeof approvedGuard,
  user: { claims: Claims } | null
): Promise<boolean | UrlTree> {
  const currentUser$ = of(
    user
      ? { getIdTokenResult: async () => ({ claims: user.claims }) }
      : null
  );
  const urlTree = (commands: string[]) => ({ tree: commands[0] }) as unknown as UrlTree;

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser$ } },
      { provide: Router, useValue: { createUrlTree: urlTree } },
    ],
  });
  return TestBed.runInInjectionContext(
    () => guard(null as never, null as never) as Promise<boolean | UrlTree>
  );
}

const redirectOf = (result: boolean | UrlTree) =>
  (result as unknown as { tree: string }).tree;

describe('approvedGuard (BB-211)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lets an approved user through', async () => {
    expect(await run(approvedGuard, { claims: { approved: true } })).toBe(true);
  });

  it('lets an admin through without the approved claim', async () => {
    expect(await run(approvedGuard, { claims: { admin: true } })).toBe(true);
  });

  it('parks an unapproved user on /pending-approval', async () => {
    const result = await run(approvedGuard, { claims: {} });
    expect(redirectOf(result)).toBe('/pending-approval');
  });

  it('rejects a truthy-but-not-true claim', async () => {
    const result = await run(approvedGuard, { claims: { approved: 'yes' } });
    expect(redirectOf(result)).toBe('/pending-approval');
  });

  it('sends signed-out visitors to /login', async () => {
    const result = await run(approvedGuard, null);
    expect(redirectOf(result)).toBe('/login');
  });
});

describe('pendingOnlyGuard (BB-211)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the pending page to an unapproved user', async () => {
    expect(await run(pendingOnlyGuard, { claims: {} })).toBe(true);
  });

  it('bounces an approved user to /tabs', async () => {
    const result = await run(pendingOnlyGuard, { claims: { approved: true } });
    expect(redirectOf(result)).toBe('/tabs');
  });

  it('sends signed-out visitors to /login', async () => {
    const result = await run(pendingOnlyGuard, null);
    expect(redirectOf(result)).toBe('/login');
  });
});
