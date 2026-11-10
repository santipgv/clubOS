import { prisma } from "@/lib/db";
import { requestContext } from "@/lib/auth/session";

/**
 * Registro de acciones sensibles. Es solo-insercion: nunca se actualiza ni se
 * borra desde la aplicacion, para que sirva como evidencia ante la junta.
 *
 * Un fallo al auditar no debe tumbar la operacion del socio, pero si dejar
 * rastro en los logs del servidor.
 */
export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.password_set"
  | "auth.password_changed"
  | "auth.logout"
  | "auth.magic_link_requested"
  | "auth.magic_link_consumed"
  | "auth.session_revoked"
  | "member.registered"
  | "member.approved"
  | "member.rejected"
  | "member.suspended"
  | "member.reactivated"
  | "member.role_changed"
  | "booking.created"
  | "booking.created_for_member"
  | "booking.cancelled"
  | "booking.marked_paid"
  | "booking.marked_no_show"
  | "wallet.topped_up"
  | "wallet.booking_paid"
  | "wallet.refunded"
  | "block.created"
  | "block.deleted"
  | "court.created"
  | "court.updated"
  | "post.created"
  | "post.published"
  | "post.unpublished"
  | "post.deleted"
  | "member.updated"
  | "member.left"
  | "member.password_reset_sent"
  | "member.bank_updated"
  | "fee.created"
  | "fee.generated"
  | "fee_rate.updated"
  | "price_rule.updated"
  | "tournament.created"
  | "tournament.updated"
  | "tournament.registration"
  | "tournament.registration_cancelled"
  | "newsletter.changed"
  | "fee.marked_paid"
  | "golf.marked_paid"
  | "golf.invitation_accepted"
  | "golf.booked"
  | "golf.cancelled"
  | "golf.course_updated"
  | "golf.block_created"
  | "settings.updated"
  | "club.identity_updated";

export async function recordAudit(input: {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as object,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[auditoria] no se pudo registrar la acción", input.action, error);
  }
}
