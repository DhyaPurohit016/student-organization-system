import { date } from '../utils/format';
import { ROLE_LABEL } from '../utils/roles';

// A digital club membership card: shown at the door or the stall, where staff scan the QR
export default function MembershipCard({ name, club, collegeCode, role, memberNumber, paidUntil, qr }) {
  return (
    <div className="member-card">
      <div className="member-card-info">
        <div className="member-card-org">
          {collegeCode} · {club}
        </div>
        <div className="member-card-name">{name}</div>
        <div className="member-card-plan">{ROLE_LABEL[role]}</div>
        <dl>
          <div>
            <dt>Member no.</dt>
            <dd>{memberNumber}</dd>
          </div>
          {paidUntil && (
            <div>
              <dt>Paid until</dt>
              <dd>{date(paidUntil)}</dd>
            </div>
          )}
        </dl>
      </div>
      {qr && <img className="member-card-qr" src={qr} alt={`Member card QR for ${memberNumber}`} />}
    </div>
  );
}
