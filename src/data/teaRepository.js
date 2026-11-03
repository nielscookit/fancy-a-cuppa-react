/**
 * Safety boundary for phase 2.
 * No production URL, credentials, Supabase client or network calls.
 * All writes deliberately fail until an isolated test backend is approved.
 */
export async function listTeas() {
  return [];
}

function blocked() {
  throw new Error('V3 development safety lock: database writes are disabled.');
}

export async function createTea() { blocked(); }
export async function updateTea() { blocked(); }
export async function deleteTea() { blocked(); }
