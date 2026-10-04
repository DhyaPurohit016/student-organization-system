# CampusClubs — multi-college student organization platform

One platform for many colleges and their clubs. It replaces spreadsheets, WhatsApp blasts, cash-at-the-door
tickets, notebook budgets and receipt-chasing: **clubs, members, events, tickets, merchandise, announcements,
volunteer tasks and finance**, kept separately for each club.

**Stack:** MySQL (or MariaDB) · Express · Sequelize · React (Vite) · Node.js · JWT

## Run locally

Requires Node 20+ and MySQL 8 (or MariaDB 10.4+, e.g. from XAMPP) running.

```bash
# 1. API
cd server
npm install
cp .env.example .env        # set DB_USER / DB_PASSWORD, JWT_SECRET and ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed                # creates the database + tables and the first Platform Admin
npm run seed:demo           # optional: 2 colleges, several clubs and a semester of data (development only)
npm run dev                 # http://localhost:5000

# 2. Client (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

The database (`DB_NAME`, default `student_org`) and its tables are created automatically.

> **Upgrading from the single-club version?** The data model changed a lot (colleges, clubs, club members).
> Start with a **new, empty database** (change `DB_NAME`, or drop the old one) and run `npm run seed` again.
> `DB_SYNC_ALTER=true` is only for small additive changes, not for this move.
>
> **Already on the multi-college version?** Start the API once with `DB_SYNC_ALTER=true` to add the new
> columns and the `support_requests` table (volunteer offers, volunteers needed, Help & Support).

The dev client forwards `/api` to `http://localhost:5000`. To point it at another API, set `API_TARGET`
(and `CLIENT_PORT` for a different client port) before `npm run dev`.

**Demo logins** (after `npm run seed:demo`, password = `DEMO_PASSWORD`, default `Demo@12345`):

| Login | Who they are |
|---|---|
| `platform@demo.test` | Platform Admin |
| `head@ldce.demo` · `head@nirma.demo` | College Heads of LDCE and Nirma |
| `krupa@ldce.demo` | Manager of the Coding Club (and volunteer in Robotics) |
| `amit@ldce.demo` | Manager of the Robotics and Cultural clubs |
| `tara@ldce.demo` | Treasurer of the Coding Club |
| `priya@ldce.demo` | Volunteer in the Coding Club, on the door check-in team |
| `rahul@ldce.demo` | Member of the Coding Club |
| `cal@ldce.demo` | LDCE student, join request waiting in the Coding Club |
| `pat@ldce.demo` | Signed up for LDCE, waiting for college approval |
| `neha@nirma.demo` | Student of another college (Nirma) |
| `john@guest.demo` | Guest with no college |

The demo seed refuses to run when `NODE_ENV=production`. Don't use demo accounts on a real deployment.

**Tests:** with the API running, `cd server && npm test` runs 332 checks across 9 suites
(hierarchy, roles, events, dues, shop, announcements, fundraisers, finance, razorpay) and cleans up after itself.

## How the platform is organised

```
Platform Admin
└── College (e.g. LDCE)                     ← College Heads run it
    ├── Students                            ← pick the college at sign-up; the Head approves them
    └── Clubs (Coding, Robotics, ...)        ← created by a College Head
        ├── Manager(s)                      ← appointed by the College Head
        ├── Treasurer · Volunteers · Members ← join by request, manager approves
        └── Events · Shop · Announcements · Fundraisers · Finance (all per club)
```

- **Sign-up uses any email.** Students choose their college from a list. Each college has an
  **“Approve new students”** setting (on by default): when on, a College Head verifies each student. When off,
  choosing the college is trusted.
- **College membership and club membership are separate.** Being a verified LDCE student doesn't make you a
  member of any club. You ask to join each club and its manager approves. A club can also require **paid dues**
  after approval: members only count as members while their plan is active.
- **A person can hold different roles in different clubs**, e.g. manager of one club and volunteer in another.
  The sidebar shows one workspace per club you help run, plus your college if you head one.

## Roles

Each person sees only the pages their roles need (the sidebar is built from their roles), and the server
checks the same rules on every request.

| Who | Sees | Can do |
|---|---|---|
| **Platform Admin** | Dashboard, Colleges & Heads, Users, Reports, Support requests, Settings, Help | Add colleges, appoint/remove College Heads, manage accounts, platform-wide reports, answer help requests sent to the platform. **Not** a student, College Head or club member, and has no access inside colleges or clubs |
| **College Head** | Dashboard, Clubs, Club Managers, Students, Events, Volunteers, Expense Management, Reports, Announcements, Support requests, Settings, My Expenses, Help | Create/archive clubs, appoint and remove club managers, approve students, approve and pay expenses from every club, college reports and announcements, answer students' help requests. Inside clubs: **view only** (except expenses and reports) |
| **Club Manager** (per club) | My Club, Members, Volunteers, Events, Participants, Tasks, Announcements, Shop, Fundraisers, Expense Management, Finance, Reports, Settings | Run the club: members and roles (not managers), events with "volunteers needed", approve volunteer offers, create and assign tasks, participants, shop, news, expenses, money |
| **Treasurer** (per club) | Volunteer pages + Expense Management, Finance, Reports | Volunteer powers plus approving/paying expenses and keeping the club's books |
| **Volunteer** (per club) | My Events, My Tasks, Helping Out, Participants, Door check-in*, My Expenses | Offer to help at events (manager approves), start/complete tasks, see participants of events they help at, check people in (*if allowed), submit expenses |
| **Student / member** | Events, College Events, My Registrations, My Membership, My Orders, Announcements | Register for events (public, own college, own clubs), join clubs, club cards and dues, merch |
| **Guest** | Public Events, My Registrations, My Orders, Explore clubs | Register for public events at the guest price; ask to join clubs |

Everyone has **Help & Support**: FAQs for their roles and a form that goes to their College Head (or to the
Platform Admin for guests, College Heads and website problems). Statuses use plain words: tasks are
Pending → In progress → Completed; expenses are Pending → Approved → Paid (or Rejected).

Only a College Head can appoint or remove a club manager, and a club can't lose its last manager. Nobody can
approve their own expense. Club role powers are defined in `server/src/config/roles.js` and checked through
`server/src/services/access.js` (capabilities: staff, view, oversee, finance, money, manage).

## Development sample users

The normal account flow stores registrations in the configured MySQL database. After submitting the sign-up form, the app confirms account creation and opens sign-in with the email prefilled; users enter their password to receive a session and access their dashboard.

From `server/`, run `npm run seed:users` to add 500 fictional accounts and populate every active college with around 30 clubs, 30 past/current/upcoming events per club, eight shop products per club, membership plans, finance ledger entries, a fundraiser and sample bills for clubs with staff. `npm run seed:demo` also ensures that every active club has the sample shop products and catalog data, including when demo accounts already exist. Run `npm run seed:catalog` later to add or repair the same catalog for all active colleges and clubs. The roster and catalog templates are maintained in `server/src/data/sampleUsers.js` and `server/src/data/sampleCatalog.js`; event managers use the club `MANAGER` role and finance users use `TREASURER`. These commands are idempotent and refuse to run when `NODE_ENV=production`. All sample accounts use `DEMO_PASSWORD` (default: `Demo@12345`).

For the built-in role walkthrough, first run `npm run seed:demo` from `server/`. Then sign in with one of these accounts (all use the same demo password):

| Role | Username (email) |
| --- | --- |
| Platform Admin | `platform@demo.test` |
| College Head | `head@ldce.demo` |
| Club/Event Manager | `krupa@ldce.demo` |
| Finance Manager (Treasurer) | `tara@ldce.demo` |
| Volunteer | `priya@ldce.demo` |
| Member | `rahul@ldce.demo` |
| Registered Guest | `john@guest.demo` |

The default password is `Demo@12345`. If `DEMO_PASSWORD` was overridden when seeding, use that value instead. For the additional 500-account roster created by `npm run seed:users`, the role email ranges are `person001`–`person250` (members), `person251`–`person350` (volunteers), `person351`–`person352` (college heads), `person353`–`person426` (event managers), and `person427`–`person500` (finance), all at `@sample500.demo.test`.

The public `/shop` page links to each club's store. Club stores provide category filters, search, stock filtering, price sorting, variant selection, member pricing and the shared cart. Club pages let visitors switch between upcoming, live and past events.
