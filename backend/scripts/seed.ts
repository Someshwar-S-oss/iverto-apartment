import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as schema from '../src/database/schema';
import { eq } from 'drizzle-orm';

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL or DIRECT_DATABASE_URL environment variable is missing.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

async function seed() {
  console.log('🌱 Starting Database Seeding on Neon PostgreSQL...');

  const saltRounds = 10;

  // 1. Superadmin User
  console.log('1. Seeding Superadmin...');
  const superadminEmail = 'superadmin@iverto.internal';
  const superadminPassHash = await bcrypt.hash('SuperAdmin@123!', saltRounds);

  let [superadmin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, superadminEmail))
    .limit(1);

  if (!superadmin) {
    [superadmin] = await db
      .insert(schema.users)
      .values({
        email: superadminEmail,
        phone: '9999999999',
        name: 'Platform Superadmin',
        passwordHash: superadminPassHash,
        isSuperadmin: true,
        mustChangePassword: false,
        status: 'ACTIVE',
      })
      .returning();
    console.log(`   ✓ Superadmin created: ${superadmin.email} (Password: SuperAdmin@123!)`);
  } else {
    console.log(`   ✓ Superadmin already exists: ${superadmin.email}`);
  }

  // 2. Client Society
  console.log('2. Seeding Society & Buildings...');
  let [society] = await db
    .select()
    .from(schema.societies)
    .where(eq(schema.societies.name, 'Palm Grove Heights'))
    .limit(1);

  if (!society) {
    [society] = await db
      .insert(schema.societies)
      .values({
        name: 'Palm Grove Heights',
        timezone: 'Asia/Kolkata',
        address: '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
      })
      .returning();
    console.log(`   ✓ Society created: ${society.name} (ID: ${society.id})`);
  }

  // 3. Buildings & Units
  let [towerA] = await db
    .select()
    .from(schema.buildings)
    .where(eq(schema.buildings.name, 'Tower A'))
    .limit(1);

  if (!towerA) {
    [towerA] = await db
      .insert(schema.buildings)
      .values({
        societyId: society.id,
        name: 'Tower A',
      })
      .returning();
  }

  let [towerB] = await db
    .select()
    .from(schema.buildings)
    .where(eq(schema.buildings.name, 'Tower B'))
    .limit(1);

  if (!towerB) {
    [towerB] = await db
      .insert(schema.buildings)
      .values({
        societyId: society.id,
        name: 'Tower B',
      })
      .returning();
  }

  const unitNumbers = [
    { building: towerA, number: 'A-101' },
    { building: towerA, number: 'A-102' },
    { building: towerA, number: 'A-201' },
    { building: towerB, number: 'B-101' },
    { building: towerB, number: 'B-102' },
  ];

  const unitMap = new Map<string, typeof schema.units.$inferSelect>();

  for (const u of unitNumbers) {
    let [unit] = await db
      .select()
      .from(schema.units)
      .where(eq(schema.units.unitNumber, u.number))
      .limit(1);

    if (!unit) {
      [unit] = await db
        .insert(schema.units)
        .values({
          buildingId: u.building.id,
          societyId: society.id,
          unitNumber: u.number,
        })
        .returning();
    }
    unitMap.set(u.number, unit);
  }
  console.log(`   ✓ Created ${unitMap.size} units across Tower A and Tower B`);

  // Helper to create users with <phone>@iverto temp password
  async function createOnboardedUser(
    email: string,
    phone: string,
    name: string,
    isSuperadmin = false,
  ) {
    let [u] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    const tempPassword = `${phone.replace(/[^0-9]/g, '')}@iverto`;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    if (!u) {
      [u] = await db
        .insert(schema.users)
        .values({
          email: email.toLowerCase(),
          phone,
          name,
          passwordHash,
          isSuperadmin,
          mustChangePassword: true,
          status: 'ACTIVE',
        })
        .returning();
      console.log(`   ✓ User created: ${email} | Phone: ${phone} | Temp Password: ${tempPassword}`);
    }
    return { user: u, tempPassword };
  }

  // 4. Society Admin & Guard Users
  console.log('3. Seeding Society Admin & Security Guards...');
  const { user: socAdmin } = await createOnboardedUser(
    'admin.palmgrove@iverto.internal',
    '9876543210',
    'Suresh Sharma (Society Admin)',
  );

  await db
    .insert(schema.societyRoles)
    .values({
      userId: socAdmin.id,
      societyId: society.id,
      role: 'SOCIETY_ADMIN',
      active: true,
    })
    .onConflictDoNothing();

  const { user: guardSupervisor } = await createOnboardedUser(
    'supervisor.palmgrove@iverto.internal',
    '9876543211',
    'Rajesh Singh (Guard Supervisor)',
  );

  await db
    .insert(schema.societyRoles)
    .values({
      userId: guardSupervisor.id,
      societyId: society.id,
      role: 'GUARD_SUPERVISOR',
      active: true,
    })
    .onConflictDoNothing();

  const { user: guardMainGate } = await createOnboardedUser(
    'guard.maingate@iverto.internal',
    '9876543212',
    'Bahadur Thapa (Main Gate Guard)',
  );

  await db
    .insert(schema.societyRoles)
    .values({
      userId: guardMainGate.id,
      societyId: society.id,
      role: 'GUARD',
      active: true,
    })
    .onConflictDoNothing();

  // 5. Residents
  console.log('4. Seeding Residents (Owners & Tenants)...');
  const { user: ownerA101 } = await createOnboardedUser(
    'owner.a101@iverto.internal',
    '9876543220',
    'Ananya Iyer (Owner A-101)',
  );
  await db
    .insert(schema.unitMemberships)
    .values({
      userId: ownerA101.id,
      unitId: unitMap.get('A-101')!.id,
      role: 'OWNER',
      isPrimary: true,
      activeFrom: new Date(),
    })
    .onConflictDoNothing();

  const { user: tenantA102 } = await createOnboardedUser(
    'tenant.a102@iverto.internal',
    '9876543221',
    'Rohan Verma (Tenant A-102)',
  );
  await db
    .insert(schema.unitMemberships)
    .values({
      userId: tenantA102.id,
      unitId: unitMap.get('A-102')!.id,
      role: 'TENANT',
      isPrimary: true,
      activeFrom: new Date(),
    })
    .onConflictDoNothing();

  const { user: ownerB101 } = await createOnboardedUser(
    'owner.b101@iverto.internal',
    '9876543222',
    'Vikram Malhotra (Owner B-101)',
  );
  await db
    .insert(schema.unitMemberships)
    .values({
      userId: ownerB101.id,
      unitId: unitMap.get('B-101')!.id,
      role: 'OWNER',
      isPrimary: true,
      activeFrom: new Date(),
    })
    .onConflictDoNothing();

  // 6. Gate & M50 Biometric Terminal
  console.log('5. Seeding M50 Biometric Terminal...');
  const gateId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  let [m50Device] = await db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.serialNo, 'DJ20250307014'))
    .limit(1);

  if (!m50Device) {
    [m50Device] = await db
      .insert(schema.devices)
      .values({
        societyId: society.id,
        gateId: gateId,
        vendor: 'M50',
        serialNo: 'DJ20250307014',
        name: 'North Main Gate Face Terminal',
        status: 'ONLINE',
      })
      .returning();
    console.log(`   ✓ M50 Terminal provisioned: Serial ${m50Device.serialNo} (Name: ${m50Device.name})`);
  }

  // 7. Staff & Multi-Unit Assignments
  console.log('6. Seeding Staff Members & Multi-Unit Fan-out Subscriptions...');
  let [maid] = await db
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.phone, '9876543230'))
    .limit(1);

  if (!maid) {
    [maid] = await db
      .insert(schema.staff)
      .values({
        societyId: society.id,
        name: 'Lakshmi Devi (Maid)',
        phone: '9876543230',
        staffType: 'MAID',
        facePersonRef: '1', // M50 Terminal UserID 1
        status: 'ACTIVE',
      })
      .returning();
  }

  // Assign Lakshmi to A-101, A-102, B-101
  for (const unitKey of ['A-101', 'A-102', 'B-101']) {
    const unit = unitMap.get(unitKey);
    if (unit) {
      await db
        .insert(schema.staffUnitAssignments)
        .values({
          staffId: maid.id,
          unitId: unit.id,
          notify: true,
          activeFrom: new Date(),
        })
        .onConflictDoNothing();
    }
  }
  console.log(`   ✓ Staff member Lakshmi (UserID 1) assigned to units: A-101, A-102, B-101`);

  let [driver] = await db
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.phone, '9876543231'))
    .limit(1);

  if (!driver) {
    [driver] = await db
      .insert(schema.staff)
      .values({
        societyId: society.id,
        name: 'Ramesh Kumar (Driver)',
        phone: '9876543231',
        staffType: 'DRIVER',
        facePersonRef: '2', // M50 Terminal UserID 2
        status: 'ACTIVE',
      })
      .returning();

    const unitA101 = unitMap.get('A-101');
    if (unitA101) {
      await db
        .insert(schema.staffUnitAssignments)
        .values({
          staffId: driver.id,
          unitId: unitA101.id,
          notify: true,
          activeFrom: new Date(),
        })
        .onConflictDoNothing();
    }
  }
  console.log(`   ✓ Staff member Ramesh (UserID 2) assigned to unit: A-101`);

  // 8. Delivery Permissions
  console.log('7. Seeding Quick-Commerce Delivery Rules...');
  const unitA101 = unitMap.get('A-101');
  if (unitA101) {
    await db
      .insert(schema.deliveryPermissions)
      .values([
        {
          unitId: unitA101.id,
          platform: 'BLINKIT',
          mode: 'ALLOW_TO_DOOR',
          silent: false,
        },
        {
          unitId: unitA101.id,
          platform: 'ZEPTO',
          mode: 'LEAVE_AT_GATE',
          silent: true,
        },
        {
          unitId: unitA101.id,
          platform: 'SWIGGY',
          mode: 'ASK_ME',
          silent: false,
        },
      ])
      .onConflictDoNothing();
    console.log(`   ✓ Configured Blinkit (Allow to door), Zepto (Leave at gate), Swiggy (Ask me) for Unit A-101`);
  }

  console.log('\n✅ Database Seeding Completed Successfully!\n');
}

seed()
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
