import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import { PublicLayout, SiteLayout } from './components/PublicLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';
import Profile from './pages/Profile';
import Help from './pages/Help';
// Public website
import Home from './pages/public/Home';
import Events from './pages/public/Events';
import EventDetail from './pages/public/EventDetail';
import Clubs from './pages/public/Clubs';
import ClubPage from './pages/public/ClubPage';
import Shop from './pages/public/Shop';
import ShopDirectory from './pages/public/ShopDirectory';
import Cart from './pages/public/Cart';
import News, { Unsubscribe } from './pages/public/News';
// Me
import MemberDashboard from './pages/member/MemberDashboard';
import MyTickets from './pages/member/MyTickets';
import MyOrders from './pages/member/MyOrders';
import MyMembership from './pages/member/MyMembership';
import Checkout from './pages/member/Checkout';
// Helping out (any club staff)
import CheckIn from './pages/staff/CheckIn';
import MyTasks from './pages/staff/MyTasks';
import MyExpenses from './pages/staff/MyExpenses';
import HelpingOut from './pages/staff/HelpingOut';
import Participants from './pages/staff/Participants';
import Volunteering from './pages/staff/Volunteering';
// Club workspace
import ClubWorkspace from './pages/club/ClubWorkspace';
import ClubDashboard from './pages/club/ClubDashboard';
import ClubMembers from './pages/club/ClubMembers';
import ClubEvents from './pages/club/ClubEvents';
import ClubEventDetail from './pages/club/ClubEventDetail';
import ClubProducts from './pages/club/ClubProducts';
import ClubOrders from './pages/club/ClubOrders';
import ClubAnnouncements from './pages/club/ClubAnnouncements';
import ClubFundraisers from './pages/club/ClubFundraisers';
import ClubFundraiserDetail from './pages/club/ClubFundraiserDetail';
import ClubFinance from './pages/club/ClubFinance';
import ClubReport from './pages/club/ClubReport';
import ClubVerify from './pages/club/ClubVerify';
import ClubSettings from './pages/club/ClubSettings';
import { ClubExpenses, ClubParticipants, ClubTasks, ClubVolunteers } from './pages/club/ClubPeople';
// College Head
import {
  CollegeAnnouncements,
  CollegeClubs,
  CollegeEvents,
  CollegeExpenses,
  CollegeManagers,
  CollegeOverview,
  CollegeReports,
  CollegeSettings,
  CollegeStudents,
  CollegeSupport,
  CollegeVolunteers,
  CollegeWorkspace,
} from './pages/college/College';
// Platform Admin
import { PlatformColleges, PlatformOverview, PlatformReports, PlatformSettings, PlatformSupport, PlatformUsers } from './pages/platform/Platform';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Public website (always the website layout) */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/news" element={<News />} />
        <Route path="/unsubscribe/:token" element={<Unsubscribe />} />
      </Route>

      {/* Shared pages: website layout for visitors, app layout when logged in */}
      <Route element={<SiteLayout />}>
        <Route path="/events" element={<Events />} />
        <Route path="/events/college" element={<Events scope="college" />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/clubs" element={<Clubs />} />
        <Route path="/clubs/:clubId" element={<ClubPage />} />
        <Route path="/shop" element={<ShopDirectory />} />
        <Route path="/clubs/:clubId/shop" element={<Shop />} />
        <Route path="/cart" element={<Cart />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Me: any logged-in user */}
          <Route path="/dashboard" element={<MemberDashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/help" element={<Help />} />
          <Route path="/membership" element={<MyMembership />} />
          <Route path="/announcements" element={<News />} />
          <Route path="/checkout/:paymentId" element={<Checkout />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/orders" element={<MyOrders />} />
          {/* Volunteer tools: the API decides what each person sees */}
          <Route path="/volunteering" element={<Volunteering />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/tasks" element={<MyTasks />} />
          <Route path="/helping-out" element={<HelpingOut />} />
          <Route path="/participants" element={<Participants />} />
          <Route path="/expenses" element={<MyExpenses />} />
          <Route path="/claims" element={<Navigate to="/expenses" replace />} />

          {/* A club I help run: tabs depend on my role in that club */}
          <Route path="/c/:clubId" element={<ClubWorkspace />}>
            <Route index element={<ClubDashboard />} />
            <Route path="members" element={<ClubMembers />} />
            <Route path="volunteers" element={<ClubVolunteers />} />
            <Route path="participants" element={<ClubParticipants />} />
            <Route path="tasks" element={<ClubTasks />} />
            <Route path="expenses" element={<ClubExpenses />} />
            <Route path="events" element={<ClubEvents />} />
            <Route path="events/:id" element={<ClubEventDetail />} />
            <Route path="shop" element={<ClubProducts />} />
            <Route path="shop/orders" element={<ClubOrders />} />
            <Route path="announcements" element={<ClubAnnouncements />} />
            <Route path="fundraisers" element={<ClubFundraisers />} />
            <Route path="fundraisers/:id" element={<ClubFundraiserDetail />} />
            <Route path="finance" element={<ClubFinance />} />
            <Route path="report" element={<ClubReport />} />
            <Route path="verify" element={<ClubVerify />} />
            <Route path="settings" element={<ClubSettings />} />
          </Route>

          {/* A college I head */}
          <Route path="/college/:collegeId" element={<CollegeWorkspace />}>
            <Route index element={<CollegeOverview />} />
            <Route path="clubs" element={<CollegeClubs />} />
            <Route path="students" element={<CollegeStudents />} />
            <Route path="events" element={<CollegeEvents />} />
            <Route path="managers" element={<CollegeManagers />} />
            <Route path="volunteers" element={<CollegeVolunteers />} />
            <Route path="expenses" element={<CollegeExpenses />} />
            <Route path="reports" element={<CollegeReports />} />
            <Route path="finance" element={<Navigate to="../reports" replace />} />
            <Route path="support" element={<CollegeSupport />} />
            <Route path="announcements" element={<CollegeAnnouncements />} />
            <Route path="settings" element={<CollegeSettings />} />
          </Route>

          {/* Platform Admin */}
          <Route element={<ProtectedRoute roles={['PLATFORM_ADMIN']} />}>
            <Route path="/platform" element={<PlatformOverview />} />
            <Route path="/platform/colleges" element={<PlatformColleges />} />
            <Route path="/platform/users" element={<PlatformUsers />} />
            <Route path="/platform/reports" element={<PlatformReports />} />
            <Route path="/platform/support" element={<PlatformSupport />} />
            <Route path="/platform/settings" element={<PlatformSettings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
