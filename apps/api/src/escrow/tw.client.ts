import { Inject, Injectable, Logger } from '@nestjs/common';
import { unavailable } from '../common/errors';
import { ENV, type Env } from '../config/env';

export interface TwRoles {
  approver: string;
  serviceProvider: string;
  platformAddress: string;
  releaseSigner: string;
  disputeResolver: string;
  receiver: string;
}

/**
 * Cliente REST de Trustless Work (escrow single-release). Las rutas devuelven XDR sin firmar;
 * cada rol firma con su propia wallet. Docs: https://docs.trustlesswork.com
 */
@Injectable()
export class TwClient {
  private readonly logger = new Logger('TrustlessWork');
  constructor(@Inject(ENV) private readonly env: Env) {}

  enabled(): boolean {
    return Boolean(this.env.TW_API_KEY);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.env.TW_API_KEY) throw unavailable('escrow_not_configured');
    const res = await fetch(`${this.env.TW_API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.env.TW_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.warn(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw unavailable(res.status === 429 ? 'escrow_rate_limited' : 'escrow_provider_error');
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  private unsigned(r: { unsignedTransaction?: string }): string {
    if (!r.unsignedTransaction) throw unavailable('escrow_provider_error');
    return r.unsignedTransaction;
  }

  async deploy(input: {
    signer: string;
    engagementId: string;
    title: string;
    description: string;
    roles: TwRoles;
    amount: number;
    platformFee: number;
    trustline: { address: string; symbol: string };
    milestones: { description: string }[];
  }): Promise<string> {
    return this.unsigned(await this.post('/deployer/single-release', input));
  }

  async fund(contractId: string, signer: string, amount: number) {
    return this.unsigned(await this.post('/escrow/single-release/fund-escrow', { contractId, signer, amount }));
  }

  async changeMilestoneStatus(contractId: string, serviceProvider: string, newStatus: string, newEvidence: string) {
    return this.unsigned(
      await this.post('/escrow/single-release/change-milestone-status', {
        contractId,
        milestoneIndex: '0',
        newStatus,
        newEvidence,
        serviceProvider,
      }),
    );
  }

  async approve(contractId: string, approver: string) {
    return this.unsigned(await this.post('/escrow/single-release/approve-milestone', { contractId, milestoneIndex: '0', approver }));
  }

  async release(contractId: string, releaseSigner: string) {
    return this.unsigned(await this.post('/escrow/single-release/release-funds', { contractId, releaseSigner }));
  }

  async dispute(contractId: string, signer: string) {
    return this.unsigned(await this.post('/escrow/single-release/dispute-escrow', { contractId, signer }));
  }

  async resolve(contractId: string, disputeResolver: string, distributions: { address: string; amount: number }[]) {
    return this.unsigned(await this.post('/escrow/single-release/resolve-dispute', { contractId, disputeResolver, distributions }));
  }

  /** Envía un XDR firmado. Devuelve la respuesta de Trustless Work (incluye contractId al desplegar). */
  async send(signedXdr: string): Promise<{ status?: string; message?: string; contractId?: string; [k: string]: unknown }> {
    return this.post('/helper/send-transaction', { signedXdr });
  }
}
