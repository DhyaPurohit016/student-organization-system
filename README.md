# Student Organization System

## Problem statement

Student organizations run on information that is usually scattered: attendance in a paper sheet, event plans in chat messages, membership details in personal spreadsheets, and approvals in conversations that disappear after an event. This makes a simple question—*who is responsible for what, and what happens next?*—surprisingly difficult to answer.

The problem is not merely storing student records. It is coordinating a small, changing community where members join and leave, committees share work, events have deadlines, and leaders need enough visibility to make fair decisions without turning participation into unnecessary administration.

This project aims to provide one dependable workspace for an organization to manage its members, activities, and operational decisions. Its value is in creating a clear chain from **member → role → task/event → outcome**, so that knowledge survives beyond any one office-bearer or academic year.

## Why this is different from a student-management system

A student-management system is centred on an institution's academic relationship with a student: enrolment, courses, grades, and fees. A student organization has a different operating model:

- Participation is voluntary and varies by event.
- A member may hold several roles across committees.
- Success is measured through engagement, delivery, and continuity—not marks.
- Leadership changes frequently, so handover is a core requirement.
- Information access must reflect organization roles while respecting member privacy.

The system should therefore support collaboration and accountability without assuming that every member is an administrator or that every activity follows a fixed academic workflow.

## Users and their needs

| User | What they need to know or do |
| --- | --- |
| Members | Maintain a profile, discover activities, register, see their responsibilities, and track participation. |
| Committee leads | Organize teams, assign work, monitor progress, and identify gaps before an event. |
| Organization leaders | Manage memberships and roles, approve plans, review participation, and preserve institutional memory. |
| Faculty adviser or administrator | Maintain appropriate oversight and access reliable summaries when needed. |

## Core challenges to solve

1. **Fragmented records** — Replace isolated spreadsheets and message threads with a shared, current source of truth.
2. **Unclear ownership** — Make responsibilities, deadlines, and approval states visible instead of relying on verbal follow-up.
3. **Event coordination** — Bring planning, registration, attendance, volunteers, and post-event results into one lifecycle.
4. **Membership continuity** — Retain a usable history of roles, contributions, and handovers as leadership rotates.
5. **Fair access and privacy** — Give people only the information and actions required for their role, while protecting personal data.

## Intended scope

At a minimum, the product should make these relationships manageable:

```text
Organization
 ├── Members
 │    └── Roles and committees
 ├── Events
 │    ├── Registrations and attendance
 │    └── Tasks, owners, and deadlines
 └── Activity history and reports
```

Useful capabilities may include member onboarding, role assignment, event publishing, registrations, attendance tracking, task assignment, announcements, approval workflows, and summary reporting. These should be introduced around real organization workflows, rather than as disconnected features.

## Success criteria

The system is successful when:

- a member can quickly understand their current commitments;
- an event lead can identify outstanding work without searching several channels;
- a leader can make membership and planning decisions from current information;
- a new committee can understand previous activity without relying on former members; and
- the organization reduces duplicate data entry while maintaining appropriate privacy controls.

## Design principles

- **One source of truth:** Record information once and reuse it across workflows.
- **Role-aware by default:** Actions and visibility follow organizational responsibility.
- **Low-friction participation:** Routine member actions should be quick on common devices.
- **Traceable, not burdensome:** Important decisions and changes are visible without excessive process.
- **Built for handover:** Historical context is a product feature, not an afterthought.

## Assumptions to validate

This analysis assumes a single student organization with recurring events and a rotating leadership team. Before implementation, validate the organization’s approval rules, required personal-data fields, reporting obligations, event types, and whether one deployment must support multiple independent organizations.

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
