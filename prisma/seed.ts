import path from "node:path";
// En Vercel y CI las variables ya llegan del entorno; .env es opcional.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { MemberType, Sport } from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Mismos parametros que src/lib/auth/password.ts.
const hashPassword = (p: string) => hash(p, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

/** Socios de prueba, para poder recorrer la aplicacion sin dar altas a mano. */
const DEMO = [
  { email: "socio@club.test", firstName: "Elena", lastName: "Marquez", role: "MEMBER", memberNumber: "0101" },
  { email: "recepcion@club.test", firstName: "Recepcion", lastName: "del Club", role: "STAFF", memberNumber: "0102" },
  { email: "pendiente@club.test", firstName: "Bruno", lastName: "Caro", role: "MEMBER", memberNumber: null },
] as const;

/** Pistas de ejemplo. Cada club da de alta las suyas en Gestion deportes. */
const PISTAS: Array<{
  sport: Sport;
  code: string;
  name: string;
  surface: string;
  isIndoor: boolean;
  slotMinutes: number;
  allowedDurations: number[];
  maxPlayers: number;
}> = [
  { sport: "PADEL", code: "PAD-1", name: "Pádel 1", surface: "Césped artificial", isIndoor: false, slotMinutes: 30, allowedDurations: [60, 90], maxPlayers: 4 },
  { sport: "PADEL", code: "PAD-2", name: "Pádel 2", surface: "Césped artificial", isIndoor: false, slotMinutes: 30, allowedDurations: [60, 90], maxPlayers: 4 },
  { sport: "PADEL", code: "PAD-3", name: "Pádel 3 (cubierta)", surface: "Césped artificial", isIndoor: true, slotMinutes: 30, allowedDurations: [60, 90], maxPlayers: 4 },
  { sport: "TENIS", code: "TEN-1", name: "Tenis 1", surface: "Tierra batida", isIndoor: false, slotMinutes: 30, allowedDurations: [60, 90, 120], maxPlayers: 4 },
  { sport: "TENIS", code: "TEN-2", name: "Tenis 2", surface: "Tierra batida", isIndoor: false, slotMinutes: 30, allowedDurations: [60, 90, 120], maxPlayers: 4 },
  { sport: "TENIS", code: "TEN-3", name: "Tenis 3", surface: "Rápida", isIndoor: false, slotMinutes: 30, allowedDurations: [60, 90, 120], maxPlayers: 4 },
  { sport: "CROQUET", code: "CRO-1", name: "Croquet 1", surface: "Césped natural", isIndoor: false, slotMinutes: 60, allowedDurations: [60, 120], maxPlayers: 4 },
  { sport: "CROQUET", code: "CRO-2", name: "Croquet 2", surface: "Césped natural", isIndoor: false, slotMinutes: 60, allowedDurations: [60, 120], maxPlayers: 4 },
];

/**
 * Los socios de prueba llevan una contraseña conocida —esta escrita en el
 * README— asi que en produccion no pueden existir. Se exige pedirlos
 * expresamente Y que el entorno no sea de produccion: cualquiera de las dos
 * condiciones por si sola se olvida el dia que se siembra la base real.
 */
let avisoDemoMostrado = false;

function debeSembrarDemo(): boolean {
  if (process.env.SEED_DEMO_USERS !== "true") return false;

  if (process.env.NODE_ENV === "production") {
    // Se consulta desde dos sitios; el aviso se da una sola vez.
    if (!avisoDemoMostrado) {
      avisoDemoMostrado = true;
      console.warn(
        "\n  AVISO: SEED_DEMO_USERS=true en un entorno de produccion.\n" +
          "  Se omiten los socios de prueba: su contraseña es publica.\n",
      );
    }
    return false;
  }
  return true;
}

async function main() {
  console.log("Sembrando datos del club…");

  for (const [i, p] of PISTAS.entries()) {
    const court = await prisma.court.upsert({
      where: { code: p.code },
      update: {
        name: p.name, sport: p.sport, surface: p.surface, isIndoor: p.isIndoor,
        slotMinutes: p.slotMinutes, allowedDurations: p.allowedDurations,
        maxPlayers: p.maxPlayers, sortOrder: i,
      },
      create: { ...p, hasLighting: true, isActive: true, sortOrder: i },
    });

    // Horario: 08:00 a 23:00 todos los dias. La junta lo ajusta desde el panel.
    await prisma.courtSchedule.deleteMany({ where: { courtId: court.id } });
    await prisma.courtSchedule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        courtId: court.id,
        weekday,
        opensAt: 8 * 60,
        closesAt: 23 * 60,
      })),
    });
  }

  // Tarifas de partida. Los socios personas fisicas quedan exentos de IVA
  // (art. 20.Uno.13 LIVA); el invitado paga con IVA general. Ver §9.
  const tarifas = [
    { sport: "PADEL" as Sport, memberType: null, priceCents: 800, label: "Pádel · socio", taxTreatment: "EXEMPT_SPORT" as const, priority: 0 },
    { sport: "TENIS" as Sport, memberType: null, priceCents: 700, label: "Tenis · socio", taxTreatment: "EXEMPT_SPORT" as const, priority: 0 },
    { sport: "CROQUET" as Sport, memberType: null, priceCents: 0, label: "Croquet · incluido en la cuota", taxTreatment: "EXEMPT_SPORT" as const, priority: 0 },
    { sport: "PADEL" as Sport, memberType: "INVITADO" as const, priceCents: 1600, label: "Pádel · invitado", taxTreatment: "STANDARD_21" as const, priority: 10 },
    { sport: "TENIS" as Sport, memberType: "INVITADO" as const, priceCents: 1400, label: "Tenis · invitado", taxTreatment: "STANDARD_21" as const, priority: 10 },
  ];

  for (const t of tarifas) {
    const existente = await prisma.priceRule.findFirst({
      where: { sport: t.sport, memberType: t.memberType, courtId: null },
    });
    if (existente) {
      await prisma.priceRule.update({ where: { id: existente.id }, data: t });
    } else {
      await prisma.priceRule.create({ data: t });
    }
  }

  // Tarifas de cuota por categoria, importe de UN semestre. La junta las ajusta
  // desde /admin/cuotas; aqui solo se ponen valores de partida.
  const cuotas: Array<{ memberType: MemberType; amountCents: number; isBilled: boolean }> = [
    { memberType: "NUMERARIO", amountCents: 22000, isBilled: true },
    { memberType: "FAMILIAR", amountCents: 11000, isBilled: true },
    { memberType: "JUVENIL", amountCents: 8000, isBilled: true },
    { memberType: "INFANTIL", amountCents: 4000, isBilled: true },
    { memberType: "ABONADO", amountCents: 15000, isBilled: true },
    { memberType: "HONORARIO", amountCents: 0, isBilled: false },
    { memberType: "INVITADO", amountCents: 0, isBilled: false },
  ];
  for (const c of cuotas) {
    await prisma.feeRate.upsert({
      where: { memberType: c.memberType },
      update: {},
      create: { ...c, taxTreatment: "NOT_SUBJECT" },
    });
  }

  // Golf tiene modelo propio: se reservan salidas, no instalaciones.
  const RECORRIDOS = [
    {
      code: "GOLF-18",
      name: "Campo de 18 hoyos",
      kind: "RECORRIDO" as const,
      holes: 18,
      teeIntervalMinutes: 10,
      maxPlayers: 4,
      memberPriceCents: 2500,
      guestPriceCents: 5000,
      buggyPriceCents: 2000,
      buggiesAvailable: true,
      opensAt: 8 * 60,
      closesAt: 19 * 60,
    },
    {
      code: "GOLF-PRACT",
      name: "Campo de prácticas",
      kind: "PRACTICAS" as const,
      holes: 0,
      teeIntervalMinutes: 30,
      maxPlayers: 6,
      memberPriceCents: 0,
      guestPriceCents: 1000,
      buggyPriceCents: 0,
      buggiesAvailable: false,
      opensAt: 9 * 60,
      closesAt: 21 * 60,
    },
  ];

  for (const [i, r] of RECORRIDOS.entries()) {
    const { opensAt, closesAt, ...datos } = r;
    const recorrido = await prisma.golfCourse.upsert({
      where: { code: r.code },
      update: { ...datos, sortOrder: i },
      create: { ...datos, sortOrder: i, isActive: true },
    });

    await prisma.golfSchedule.deleteMany({ where: { courseId: recorrido.id } });
    await prisma.golfSchedule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        courseId: recorrido.id,
        weekday,
        opensAt,
        closesAt,
      })),
    });
  }
  console.log(`${RECORRIDOS.length} recorridos de golf sembrados.`);

  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminEmail) {
    // La contrasena solo se toca si se ha indicado una: volver a sembrar no
    // debe pisar la que el administrador haya cambiado por su cuenta.
    const conPassword = adminPassword
      ? { passwordHash: await hashPassword(adminPassword), passwordUpdatedAt: new Date() }
      : {};

    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN", status: "ACTIVE", ...conPassword },
      create: {
        email: adminEmail,
        firstName: "Administrador",
        lastName: "del Club",
        role: "ADMIN",
        status: "ACTIVE",
        memberNumber: "0001",
        memberType: "NUMERARIO",
        emailVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        approvedAt: new Date(),
        ...conPassword,
      },
    });
    console.log(
      `Administrador listo: ${admin.email}${adminPassword ? " (con contrasena)" : " (sin contrasena: entra por enlace)"}`,
    );
  } else {
    console.warn("SEED_ADMIN_EMAIL no definido: no se ha creado administrador.");
  }

  if (debeSembrarDemo()) {
    const demoPassword = process.env.SEED_DEMO_PASSWORD;
    if (!demoPassword) {
      console.warn("SEED_DEMO_USERS=true pero falta SEED_DEMO_PASSWORD: se omiten los socios de prueba.");
    } else {
      const passwordHash = await hashPassword(demoPassword);
      for (const d of DEMO) {
        const activo = d.memberNumber !== null;
        await prisma.user.upsert({
          where: { email: d.email },
          update: { passwordHash, passwordUpdatedAt: new Date(), role: d.role, status: activo ? "ACTIVE" : "PENDING" },
          create: {
            email: d.email,
            firstName: d.firstName,
            lastName: d.lastName,
            role: d.role,
            status: activo ? "ACTIVE" : "PENDING",
            memberNumber: d.memberNumber,
            memberType: "NUMERARIO",
            emailVerifiedAt: new Date(),
            acceptedTermsAt: new Date(),
            approvedAt: activo ? new Date() : null,
            passwordHash,
            passwordUpdatedAt: new Date(),
          },
        });
      }
      console.log(`${DEMO.length} socios de prueba listos: ${DEMO.map((d) => d.email).join(", ")}`);

      // Antiguedad, una cuota pendiente y una pagada, para que el perfil y la
      // ficha se vean con datos reales.
      const elena = await prisma.user.findUnique({ where: { email: "socio@club.test" }, select: { id: true } });
      if (elena) {
        await prisma.user.update({
          where: { id: elena.id },
          data: { joinedAt: new Date("2019-04-12T00:00:00Z"), phone: "+34 600 111 222", city: "Valdemoro", province: "Madrid" },
        });
        const cuotas = [
          { period: "2025", concept: "Cuota anual de socio", amountCents: 42000, dueDate: new Date("2025-01-31"), status: "PAID" as const, paidAt: new Date("2025-01-15") },
          { period: "2026", concept: "Cuota anual de socio", amountCents: 44000, dueDate: new Date("2026-01-31"), status: "PENDING" as const, paidAt: null },
        ];
        for (const c of cuotas) {
          await prisma.membershipFee.upsert({
            where: { userId_period_concept: { userId: elena.id, period: c.period, concept: c.concept } },
            update: {},
            create: { userId: elena.id, ...c },
          });
        }
      }
    }
  }

  // Tablon de ejemplo, para que la pagina de inicio no aparezca vacia.
  const autor = adminEmail
    ? await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } })
    : null;

  if (autor && debeSembrarDemo()) {
    const noticias = [
      {
        slug: "torneo-social-de-padel-2026",
        title: "Torneo Social de Pádel 2026",
        excerpt: "Inscripciones abiertas en secretaría hasta el 5 de septiembre.",
        body: "El torneo social de pádel se celebrará el fin de semana del 12 y 13 de septiembre. Categorías masculina, femenina y mixta.",
        category: "EVENTO" as const,
        eventDate: new Date("2026-09-12T00:00:00Z"),
        isPinned: true,
      },
      {
        slug: "nuevo-horario-de-pistas",
        title: "Nuevo horario de pistas de tenis",
        excerpt: "A partir de septiembre las pistas cierran a las 22:00.",
        body: "Con el cambio de estacion, las pistas de tenis pasan a cerrar a las 22:00 de lunes a domingo.",
        category: "AVISO" as const,
        eventDate: null,
        isPinned: false,
      },
    ];
    for (const n of noticias) {
      await prisma.post.upsert({
        where: { slug: n.slug },
        // Se actualizan los textos: si se corrige una errata en la semilla,
        // volver a sembrar debe arreglar tambien lo ya escrito.
        update: { title: n.title, excerpt: n.excerpt, body: n.body, category: n.category },
        create: { ...n, publishedAt: new Date(), authorId: autor.id },
      });
    }
    console.log(`${noticias.length} noticias de ejemplo publicadas.`);

    // Un torneo de ejemplo, con invitados admitidos, para ver la inscripcion.
    const ano = new Date().getFullYear();
    await prisma.tournament.upsert({
      where: { slug: `torneo-social-de-padel-${ano}` },
      update: {},
      create: {
        slug: `torneo-social-de-padel-${ano}`,
        name: "Torneo Social de Pádel",
        description:
          "Categorías masculina, femenina y mixta. Se juega a dobles, con sorteo de parejas el viernes por la tarde.",
        sport: "PADEL",
        startsAt: new Date(`${ano}-09-12T08:00:00Z`),
        endsAt: new Date(`${ano}-09-13T20:00:00Z`),
        opensAt: new Date(`${ano}-08-01T00:00:00Z`),
        closesAt: new Date(`${ano}-09-05T22:00:00Z`),
        maxParticipants: 24,
        allowGuests: true,
        memberPriceCents: 1500,
        guestPriceCents: 2500,
        memberTaxTreatment: "EXEMPT_SPORT",
        guestTaxTreatment: "STANDARD_21",
        status: "OPEN",
        createdById: autor.id,
      },
    });
    console.log("1 torneo de ejemplo con inscripciones abiertas.");
  }

  console.log(`${PISTAS.length} pistas y ${tarifas.length} tarifas sembradas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
