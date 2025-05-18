# Pawsitive Strides - Dog Walking Platform (India)

## 1. Project Overview

Pawsitive Strides is a two-sided web platform designed to connect pet owners in India with verified, local dog walkers. It provides a convenient, safe, and reliable solution for scheduling and managing dog walking services.

**Target Audience:**

*   **Pet Owners:** Busy individuals or families needing help walking their dogs.
*   **Dog Walkers:** Individuals seeking flexible income opportunities.

**Key Goals:**

*   User-friendly and trustworthy platform experience.
*   Secure booking and payment processing tailored for India.
*   Ensure the safety and well-being of pets and walkers.
*   Build a scalable foundation for future growth within the Indian market.

## 2. Features

*   **Responsive Design:** Fully functional across desktops, tablets, and mobile devices.
*   **User Authentication:** Secure signup/login (Email/Password).
    *   Password Reset functionality.
    *   Mobile OTP Verification (Planned).
*   **Dual User Roles:** Distinct experiences and dashboards for Pet Owners and Dog Walkers.
*   **Subscription Plans:** Simple monthly/annual plans for Pet Owners and a low-cost plan for Walkers.
*   **Location Services (Google Maps):**
    *   Address input with Google Places Autocomplete.
    *   Interactive map for pinning precise location during profile setup/update.
    *   Map view displaying user's location and nearby walkers/owners (using client-side geocoding).
*   **Detailed Profiles:**
    *   **Pet Owners:** Manage personal info, manage subscription.
    *   **Dog Walkers:** Manage personal info, availability, rates (Planned), background verification status (Planned).
    *   **Dogs:** Create detailed profiles for each pet (name, breed, age, needs, photo uploads, etc.).
*   **Map View:** Visualize user's own location and nearby users of the opposite role.
*   **Profile Management:** Users can update their profile information, including location via address input or map pinning.
*   **Verification:** "Verified" badge concept for walkers (requires Background Check integration).
*   **Admin Panel (Planned):** Backend interface for user management, platform oversight, etc.
*   **Payment Gateway Integration (Planned):** Support for Indian payment methods (UPI, Wallets, Cards, Net Banking) via Razorpay or PayU.
*   **Background Checks (Planned):** Integration with a third-party service for walker verification.
*   **Booking System (Planned):** Functionality for owners to request walks and walkers to accept.
*   **Messaging (Planned):** In-app communication between owners and walkers.
*   **Notifications (Planned):** Push/in-app notifications for key events.
*   **Reviews & Ratings (Planned):** System for owners to review walkers.

## 3. Tech Stack (Current Implementation)

*   **Frontend:** HTML, CSS (Tailwind CSS), Vanilla JavaScript
*   **Backend & Database:** Supabase (PostgreSQL Database, Auth, Storage, Realtime - leveraged as BaaS)
*   **Mapping:** Google Maps Platform APIs (Maps JavaScript API, Geocoding API, Places API)
*   **Hosting:** Deployed via standard web hosting or services supporting static sites + Supabase backend (e.g., Netlify, Vercel, GitHub Pages with limitations).

*(Note: The original plan allowed for frameworks like React/Vue/Angular and backend choices like Node/Django. The current implementation uses Vanilla JS and Supabase BaaS for simplicity and reduced code complexity as requested.)*

## 4. Prerequisites

*   Web Browser (Chrome, Firefox, Edge recommended)
*   Node.js and npm (for development dependencies, if any are added later, e.g., a local dev server)
*   Supabase Account & Project Setup
*   Google Cloud Platform Account & Project Setup
*   API Keys:
    *   Supabase Project URL and Anon Key
    *   Google Maps API Key (with Maps JavaScript, Geocoding, Places APIs enabled)

## 5. Getting Started

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd pawsitive-strides-frontend
    ```

2.  **Install Dependencies (If applicable):**
    *   If using a local development server or build tools:
        ```bash
        npm install
        ```
    *   If just opening HTML files directly, this step might not be needed initially.

3.  **Environment Variables:**
    *   The Supabase URL and Anon Key are currently hardcoded in `common.js`. **For security, it's highly recommended to move these to environment variables** if deploying or sharing code. Create a `.env` file in the root (and add it to `.gitignore`) if using a build tool that supports it.
    *   The Google Maps API key is currently hardcoded in `profile.html` and `signup.html`. **This is insecure for production.** Restrict your key in the Google Cloud Console using HTTP referrers and consider more secure loading methods for deployment.

4.  **Supabase Setup:**
    *   Create a new project on [Supabase](https://supabase.com/).
    *   Navigate to the **SQL Editor**.
    *   Execute the SQL script provided in `supabase.md` (or the latest schema setup script) to create the `profiles`, `dogs` tables, RLS policies, and the `handle_new_user` trigger function.
    *   Ensure the `id` column in `profiles` is correctly linked as a foreign key to `auth.users.id`.
    *   Enable Row Level Security (RLS) on the `profiles` and `dogs` tables in the Supabase dashboard if not done by the script.
    *   Add the required RLS policies as defined in `supabase.md` (or the latest script) if not created by the script.

5.  **Google Maps API Key Setup:**
    *   Create a project on [Google Cloud Platform](https://console.cloud.google.com/).
    *   Enable the **Maps JavaScript API**, **Geocoding API**, and **Places API**.
    *   Create an API Key.
    *   **Crucially:** Add HTTP referrer restrictions to your API key for security, allowing your development URLs (e.g., `http://127.0.0.1:xxxx/*`, `http://localhost:xxxx/*`) and your final deployment domain(s).
    *   Ensure billing is enabled on your GCP project (required even for the free tier).
    *   Replace the placeholder API key in `profile.html` and `signup.html` with your actual key (or implement a more secure loading method).

6.  **Run Locally:**
    *   The simplest way is often using a live server extension in your code editor (like VS Code's Live Server) to open the `.html` files (e.g., `index.html`, `login.html`).
    *   If you set up `npm`, you might have a command:
        ```bash
        npm run dev # or npm start
        ```

## 6. Key Functionality

*   **Signup:** Users choose a role (Owner/Walker) and plan, provide details (name, email, mobile, password, address). Coordinates are geocoded client-side and saved *after* successful Supabase Auth signup.
*   **Login:** Standard email/password authentication via Supabase Auth.
*   **Profile Management:** Users view/edit their basic info. Location can be updated via address input (with Autocomplete) or by pinning on an interactive map. Dog profiles can be added/managed by owners.
*   **Map View:** Displays the logged-in user's location marker. Fetches other users of the opposite role, geocodes their addresses client-side, and displays their markers (no distance filtering currently).

## 7. Contributing

Contributions are welcome! Please follow standard Git workflow (fork, branch, pull request). (Further details can be added).

## 8. License

(Specify your license, e.g., MIT License)

## Vercel Environment Variables for Razorpay

1. Go to your project on [Vercel Dashboard](https://vercel.com/dashboard).
2. Navigate to **Settings > Environment Variables**.
3. Add the following variables:
   - `RAZORPAY_KEY_ID` (your Razorpay API key ID)
   - `RAZORPAY_KEY_SECRET` (your Razorpay API key secret)
4. Redeploy your project after saving changes.