const sequelize = require('../config/sequelize');

const College = require('./College')(sequelize);
const CollegeAdmin = require('./CollegeAdmin')(sequelize);
const Club = require('./Club')(sequelize);
const ClubMember = require('./ClubMember')(sequelize);
const User = require('./User')(sequelize);
const MembershipPlan = require('./MembershipPlan')(sequelize);
const Membership = require('./Membership')(sequelize);
const Payment = require('./Payment')(sequelize);
const Counter = require('./Counter')(sequelize);
const Event = require('./Event')(sequelize);
const Ticket = require('./Ticket')(sequelize);
const Product = require('./Product')(sequelize);
const ProductVariant = require('./ProductVariant')(sequelize);
const Order = require('./Order')(sequelize);
const OrderItem = require('./OrderItem')(sequelize);
const Announcement = require('./Announcement')(sequelize);
const Subscriber = require('./Subscriber')(sequelize);
const Fundraiser = require('./Fundraiser')(sequelize);
const Task = require('./Task')(sequelize);
const LedgerEntry = require('./LedgerEntry')(sequelize);
const ExpenseClaim = require('./ExpenseClaim')(sequelize);
const Notification = require('./Notification')(sequelize);
const EventVolunteer = require('./EventVolunteer')(sequelize);
const SupportRequest = require('./SupportRequest')(sequelize);

// ---------- Relationships (these become foreign keys) ----------

// Colleges, clubs and who belongs where
College.hasMany(User, { foreignKey: 'collegeId', as: 'students' });
User.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });
College.hasMany(CollegeAdmin, { foreignKey: 'collegeId', as: 'admins', onDelete: 'CASCADE' });
CollegeAdmin.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });
CollegeAdmin.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(CollegeAdmin, { foreignKey: 'userId', as: 'collegeRoles' });
College.hasMany(Club, { foreignKey: 'collegeId', as: 'clubs' });
Club.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });
Club.hasMany(ClubMember, { foreignKey: 'clubId', as: 'members' });
ClubMember.belongsTo(Club, { foreignKey: 'clubId', as: 'club' });
ClubMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
ClubMember.belongsTo(User, { foreignKey: 'decidedById', as: 'decidedBy' });
User.hasMany(ClubMember, { foreignKey: 'userId', as: 'clubRoles' });

// Everything a club owns
for (const Model of [MembershipPlan, Membership, Payment, Event, Product, Order, Fundraiser, Task, LedgerEntry, ExpenseClaim, Subscriber]) {
  Club.hasMany(Model, { foreignKey: 'clubId' });
  Model.belongsTo(Club, { foreignKey: 'clubId', as: 'club' });
}
Event.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });
Announcement.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });
Announcement.belongsTo(Club, { foreignKey: 'clubId', as: 'club' });
Event.hasMany(EventVolunteer, { foreignKey: 'eventId', as: 'volunteers', onDelete: 'CASCADE' });
EventVolunteer.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
EventVolunteer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Members & payments
User.hasMany(Membership, { foreignKey: 'userId', as: 'memberships' });
Membership.belongsTo(User, { foreignKey: 'userId', as: 'user' });
MembershipPlan.hasMany(Membership, { foreignKey: 'planId', as: 'memberships' });
Membership.belongsTo(MembershipPlan, { foreignKey: 'planId', as: 'plan' });
Membership.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Payment.belongsTo(User, { foreignKey: 'recordedById', as: 'recordedBy' });

// Events & tickets
Event.hasMany(Ticket, { foreignKey: 'eventId', as: 'tickets' });
Ticket.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Ticket.belongsTo(User, { foreignKey: 'userId', as: 'buyer' });
Ticket.belongsTo(User, { foreignKey: 'checkedInById', as: 'checkedInBy' });
Ticket.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Event.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

// Shop
Product.hasMany(ProductVariant, { foreignKey: 'productId', as: 'variants', onDelete: 'CASCADE' });
ProductVariant.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Order.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderItem.belongsTo(ProductVariant, { foreignKey: 'variantId', as: 'variant' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Announcements
Announcement.belongsTo(User, { foreignKey: 'authorId', as: 'author' });

// Fundraisers & tasks
Fundraiser.hasMany(Task, { foreignKey: 'fundraiserId', as: 'tasks', onDelete: 'CASCADE' });
Task.belongsTo(Fundraiser, { foreignKey: 'fundraiserId', as: 'fundraiser' });
Event.hasMany(Task, { foreignKey: 'eventId', as: 'tasks' });
Task.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Task.belongsTo(User, { foreignKey: 'assigneeId', as: 'assignee' });
Task.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
Fundraiser.belongsTo(User, { foreignKey: 'leadId', as: 'lead' });

// Finance
LedgerEntry.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
LedgerEntry.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
LedgerEntry.belongsTo(Fundraiser, { foreignKey: 'fundraiserId', as: 'fundraiser' });
LedgerEntry.belongsTo(User, { foreignKey: 'recordedById', as: 'recordedBy' });
ExpenseClaim.belongsTo(User, { foreignKey: 'claimantId', as: 'claimant' });
ExpenseClaim.belongsTo(User, { foreignKey: 'reviewedById', as: 'reviewedBy' });
ExpenseClaim.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
ExpenseClaim.belongsTo(Fundraiser, { foreignKey: 'fundraiserId', as: 'fundraiser' });
LedgerEntry.belongsTo(ExpenseClaim, { foreignKey: 'claimId', as: 'claim' });

// Help & Support
SupportRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });
SupportRequest.belongsTo(User, { foreignKey: 'resolvedById', as: 'resolvedBy' });
SupportRequest.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });

// Notifications
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  College,
  CollegeAdmin,
  Club,
  ClubMember,
  EventVolunteer,
  User,
  MembershipPlan,
  Membership,
  Payment,
  Counter,
  Event,
  Ticket,
  Product,
  ProductVariant,
  Order,
  OrderItem,
  Announcement,
  Subscriber,
  Fundraiser,
  Task,
  LedgerEntry,
  ExpenseClaim,
  Notification,
  SupportRequest,
};
