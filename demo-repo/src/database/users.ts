/**
 * User Vault — deterministic in-memory user store.
 *
 * PulseBoard is an internal tool; the employee directory is seeded at boot
 * from the HR sync. For local development we use a fixed set of records.
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: "engineer" | "manager" | "admin";
  /** Salted-and-hashed in production; plain for the local seed data. */
  password: string;
}

const USERS: UserRecord[] = [
  {
    id: "usr_01",
    email: "amara.osei@pulse.internal",
    name: "Amara Osei",
    role: "engineer",
    password: "correct-horse-battery",
  },
  {
    id: "usr_02",
    email: "jonas.lindqvist@pulse.internal",
    name: "Jonas Lindqvist",
    role: "manager",
    password: "hunter2-but-longer",
  },
  {
    id: "usr_03",
    email: "priya.raman@pulse.internal",
    name: "Priya Raman",
    role: "admin",
    password: "tribble-tribute-42",
  },
];

export function findUserByEmail(email: string): UserRecord | undefined {
  return USERS.find((user) => user.email === email.toLowerCase().trim());
}

export function findUserById(id: string): UserRecord | undefined {
  return USERS.find((user) => user.id === id);
}

export function verifyCredentials(
  email: string,
  password: string
): UserRecord | null {
  const user = findUserByEmail(email);
  if (!user) return null;
  if (user.password !== password) return null;
  return user;
}
