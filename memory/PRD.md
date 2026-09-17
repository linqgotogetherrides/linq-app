# LinQ Rides — Product Requirements Document

## Original Problem Statement
Build the complete **LinQ Rides** mobile app frontend in React Native + TypeScript (Expo). LinQ is a community-based mobility platform connecting people travelling the same direction (Car/Bike/Cab/Auto pool). Discover "Ride Twins" on the same route, share travel costs, find trusted connections, reduce congestion & CO₂. Must feel modern, premium, trustworthy, youthful, community-focused, safe — NOT like Uber/Ola. Frontend-only with mock services, architected for later Supabase/backend integration.

## Architecture
- **Framework**: Expo Router (file-based routing), React Native, TypeScript
- **State**: React Context (`AppContext`) for user, access limits (requests/chats), wallet, rewards, toast
- **Design tokens**: `/src/theme/tokens.ts` (LinQ blue #2453C8, navy #172033, soft borders, pill buttons, rounded cards)
- **Mock layer**: `/src/mock/data.ts`, `/src/services/rideService.ts` (route-matching scoring: pickup 40 / drop 40 / time 10 / name 10 → exact >70, nearby >30)
- **Components**: PrimaryButton, RideCard, SegmentedControl, LinqHeader, EmptyState, Mission1000Banner, LinqLogo, Toast, Card
- **Navigation**: Auth flow (splash → onboarding → login → otp → account-creation → emergency → verification) + Tabs (Home, Rides, Create+, Messages, Profile) + stack detail screens

## User Personas
1. **Daily commuter (Anjana, 24)** — recurring office commute, wants to split costs & find safe pool partners
2. **Ride offerer / driver** — has empty seats, wants to earn & reduce cost
3. **Planned traveller** — future one-off trips (station, airport)
4. **Safety-conscious female rider** — needs women-only mode & verified members

## Core Requirements (static)
- Instant / Daily / Planned ride modes (segmented control)
- Ride Twin discovery + route matching
- Ride request & contact-unlock model with free limits (2 requests + 2 chats early access, then 1/day)
- Pricing: Weekly ₹19, Monthly ₹49, Single Unlock ₹9
- Rewards: Refer ₹5, Ride Confirmed ₹7 (separate reward balance from wallet)
- Create Ride (Daily/Planned, vehicle details, seats stepper, price slider, women-only)
- Profile, verification (Aadhaar/PAN/DL), linked accounts, wallet, transactions
- Mission1000 community/CO₂ positioning
- Empty / loading / error states everywhere

## Implemented (2026-08-15)
- ✅ Splash, Onboarding (4 slides), Login, OTP, Account Creation, Emergency, Verification
- ✅ Home (greeting, location, refer, notifications, hero banner, Instant/Daily/Planned segmented search card with route line, day picker, time selectors, usage limit banner, nearby rides)
- ✅ Rides list (search results, filter chip row, filters bottom sheet, loading/empty/error states)
- ✅ Ride Details (profile, route, info grid, CO₂, vehicle, safety, request/cancel + contact)
- ✅ Create Ride (Daily/Planned, vehicle Yes/No, transport mode, seats stepper, price slider, passengers, women-only, publish success screen, save draft)
- ✅ Messages list + Chat (active ride, bubbles, confirm-ride, locked chat with upgrade)
- ✅ Profile (hero, stats, account/payments/rides/more sections)
- ✅ Pricing & Rewards (Early Access, Weekly/Monthly plans, Single Unlock, Earn Rewards) — no bottom nav per spec
- ✅ Wallet, Transactions (filter tabs), Rewards, Referral (code + share)
- ✅ My Rides (created/requested/past), Ride History
- ✅ Personal Info (editable), Verification profile, Linked Accounts, Notifications, Safety & Privacy, Support (FAQ), Language, Settings
- ✅ Access-limit logic wired to requests/chats; plan upgrade & single unlock update state

## Prioritized Backlog
- **P1**: Passenger add/edit modal (currently add is placeholder), location autocomplete picker, real date/time pickers
- **P1**: Request receiver / incoming requests accept-decline screen
- **P2**: Skeleton loaders (currently spinners), Reanimated entrance animations
- **P2**: Supabase integration to replace mock services
- **P2**: Real share sheet, WhatsApp/Instagram/Telegram deep links for contact unlock

## Next Tasks
- Add location search picker with Hyderabad suggestions
- Replace spinners with skeleton cards on Home/Rides

## Iteration 2 (2026-08-15)
- ✅ Real LinQ logo added (splash, onboarding, login, app icon, splash image, favicon)
- ✅ Rides tab rebuilt as management hub: Ride Requests (Incoming/Sent), Ride posts (Published/Drafts), Upcoming — with Daily/Planned filter
- ✅ **Request Detail sheet**: Accept opens a bottom sheet to confirm seats (stepper + live fare) before locking in
- ✅ **Chat link**: confirmed request → "Message traveller" jumps to chat; Upcoming cards have a chat button
- ✅ **Post Analytics**: published posts show views · requests · seats
- ✅ Search results moved to dedicated `/search-results` screen with filters
- Tech stack: Expo SDK 54, Expo Router 6 (file-based), React Native 0.81, React 19, TypeScript, @gorhom/bottom-sheet, expo-image, @expo/vector-icons (Ionicons), react-native-reanimated, react-native-gesture-handler, react-native-safe-area-context, React Context for state
