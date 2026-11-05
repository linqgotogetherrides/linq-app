# LinQ / GoTogetherRides — Project Change Log

Branch: sumanth-edits
Repository: linqgotogetherrides/linq-app

## 1. Authentication and onboarding
- Simplified name and phone signup approach.
- Guest browsing mode.
- Shared guest state in AppContext.
- Authentication navigation updates.
- Firebase and Supabase integration changes.
- OAuth handling improvements.
- Session persistence and restoration changes.

## 2. Home screen and navigation
- Home screen updates.
- Pickup and drop state management.
- Guest-mode restrictions.
- Profile and settings updates.

## 3. Location management
- Pickup/drop selection flow.
- Coordinate validation.
- Duplicate-location prevention.
- Current-location handling.

## 4. Ride search and matching
- Nearby ride retrieval changes.
- Search validation and filtering.
- RideCard updates.
- H3 and route-corridor matching development.

## 5. Backend
- Supabase configuration changes.
- Authentication and session integration.
- Ride service updates.

## 6. Build and security
- Expo app configuration.
- EAS build configuration.
- Git ignore rules for sensitive files.

## 7. Modified tracked files
- .gitignore
- frontend/app.json
- frontend/app/(tabs)/home.tsx
- frontend/app/(tabs)/profile.tsx
- frontend/app/account-creation.tsx
- frontend/app/login.tsx
- frontend/app/ride-location-flow.tsx
- frontend/app/search-results.tsx
- frontend/app/settings.tsx
- frontend/eas.json
- frontend/src/components/RideCard.tsx
- frontend/src/context/AppContext.tsx
- frontend/src/lib/auth.d.ts
- frontend/src/lib/auth.native.ts
- frontend/src/lib/auth.web.ts
- frontend/src/lib/authNavigation.ts
- frontend/src/lib/oauth.ts
- frontend/src/lib/supabase.ts
- frontend/src/services/rideService.ts
- frontend/src/services/session.ts

## 8. Known issues requiring verification
- Repeated sign-in requests.
- Session persistence after app restart.
- Non-responsive buttons.
- Location suggestions failing.
- Incorrect ride matches.
- Instant rides not appearing.
- Loading indicator alignment.

## 9. Release status
- GitHub branch created.
- Project changes documented.
- Code review pending.
- Home and login conflict resolution pending.
- Tests pending.
- Commit and push pending.
- Deployment pending.

Note: This document records reported development work. It does not certify that every feature is complete or tested.
