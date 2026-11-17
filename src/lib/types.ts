/**
 * Prisma 7 exporta los tipos de modelo con sufijo `Model`. Este fichero les da
 * el nombre del dominio para que el resto del codigo se lea en castellano de
 * negocio y no en jerga del generador.
 */
export type {
  UserModel as User,
  SessionModel as Session,
  CourtModel as Court,
  CourtScheduleModel as CourtSchedule,
  PriceRuleModel as PriceRule,
  BookingModel as Booking,
  CourtBlockModel as CourtBlock,
  PaymentModel as Payment,
  AuditLogModel as AuditLog,
  MembershipFeeModel as MembershipFee,
  PostModel as Post,
  TournamentModel as Tournament,
  TournamentRegistrationModel as TournamentRegistration,
  FeeRateModel as FeeRate,
  GolfCourseModel as GolfCourse,
  GolfScheduleModel as GolfSchedule,
  GolfTeeTimeModel as GolfTeeTime,
  GolfBookingModel as GolfBooking,
  GolfBlockModel as GolfBlock,
} from "@/generated/prisma/models";

export type {
  Role,
  Relationship,
  UserStatus,
  FeeStatus,
  PostCategory,
  MemberType,
  Sport,
  BookingStatus,
  PaymentStatus,
  PaymentMethod,
  TaxTreatment,
  BlockType,
  TournamentSport,
  TournamentStatus,
  RegistrationStatus,
  GolfCourseKind,
  GolfBookingStatus,
} from "@/generated/prisma/enums";
