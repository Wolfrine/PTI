import { readFile } from 'node:fs/promises';
import { weddingSeed } from '../scripts/seed-record.mjs';

/** Node-only test copy of documented menus, plus explicitly synthetic people/logistics. Never imported by the application. */
export async function recordFixture(actor = 'demo-owner') {
  const seed = weddingSeed(
    await readFile(new URL('../WEDDING_RECORD.md', import.meta.url), 'utf8'),
  );
  const stamp = {
    revision: 1,
    createdAt: '2026-10-15T09:00:00Z',
    createdBy: actor,
    updatedAt: '2026-10-15T09:00:00Z',
    updatedBy: actor,
    archived: false,
    lastChangeId: 'test-fixture',
  };
  const records = {
    events: seed.events.map((e) => ({ ...e, ...stamp })),
    decisions: seed.decisions.map((d) => ({ ...d, ...stamp })),
    guests: [
      {
        ...stamp,
        id: 'synthetic-person',
        name: 'Synthetic original guest',
        household: 'Synthetic household',
        family: 'Test family',
        phone: '',
        dietary: '',
        arrivalAt: '',
        departureAt: '',
        stayFrom: '',
        stayUntil: '',
        accommodation: '',
        room: '',
        transport: '',
        notes: '',
      },
    ],
    attendance: [],
    arrangements: [
      {
        ...stamp,
        id: 'synthetic-arrangement',
        title: 'Synthetic hospitality arrangement',
        category: 'Hospitality',
        eventId: '',
        owner: 'Test owner',
        status: 'proposed',
        due: '',
        vendor: 'Synthetic provider',
        contact: 'Private test contact',
        agreedAmount: 1000,
        paidAmount: 200,
        notes: 'Synthetic responsibility',
      },
    ],
  };
  Object.assign(records.events[0], {
    venue: 'Synthetic preservation venue',
    address: 'Synthetic preservation address',
    mapUrl: 'https://maps.google.com/?q=synthetic',
    owner: 'Synthetic responsible person',
    audience: 'Synthetic family group',
    arrivalAt: '2027-01-18T08:00:00+05:30',
  });
  return records;
}
