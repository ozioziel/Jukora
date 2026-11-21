import { describe, expect, it } from 'vitest';
import { supabaseServiceHeaders } from './storage.service';

describe('supabaseServiceHeaders', () => {
  it('clave heredada service_role (JWT): apikey y Authorization Bearer', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.firma';
    expect(supabaseServiceHeaders(jwt)).toEqual({ apikey: jwt, authorization: `Bearer ${jwt}` });
  });

  it('clave secreta nueva (sb_secret_): solo apikey, sin Authorization', () => {
    const secret = 'sb_secret_prueba_no_real';
    const headers = supabaseServiceHeaders(secret);
    expect(headers).toEqual({ apikey: secret });
    expect(headers).not.toHaveProperty('authorization');
  });
});
