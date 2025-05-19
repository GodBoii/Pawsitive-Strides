# Pawsitive Strides 🐾 – Dog Walking Platform (India)

Pawsitive Strides is a modern, two-sided web platform connecting pet owners in India with verified, local dog walkers. The platform is designed for safety, convenience, and reliability, with a focus on the Indian market and payment ecosystem.

## 🚀 Features

- **Responsive Design:** Works beautifully on desktop, tablet, and mobile.
- **User Authentication:** Secure signup/login via Supabase Auth (email/password, email verification).
- **Dual User Roles:** Distinct flows and dashboards for Pet Owners and Dog Walkers.
- **Subscription Management:** 
  - Pet Owners: Monthly (₹199) or Annual (₹499) plans.
  - Dog Walkers: ₹19/month plan.
  - Recurring billing, plan upgrades, and renewals.
- **Indian Payment Gateway:** Razorpay integration (UPI, wallets, net banking, cards).
- **Location Services:**
  - Google Places Autocomplete for address input.
  - Google Maps for precise location selection and search.
  - Distance-based search and filtering.
- **Dog Profiles:** Owners can add/manage detailed profiles for each dog (breed, age, temperament, vaccination records, etc.).
- **Walker Profiles:** Walkers can set experience, availability, pricing, and upload verification documents.
- **Booking System:** Calendar-based booking, flexible time slots, recurring walks.
- **Quick Ride:** On-demand walk requests and real-time job matching.
- **Background Verification:** (API-ready) for Aadhaar and ID proof.
- **Real-Time Notifications:** (API-ready) via Firebase Cloud Messaging.
- **Messaging:** (API-ready) for in-app communication.
- **Admin Panel:** (API-ready) for user, booking, and payment management.
- **Reviews & Ratings:** (API-ready) for pet owners to rate walkers.
- **Security:** HTTPS, password hashing, RLS, and best practices throughout.

## 🏗️ Tech Stack

- **Frontend:** HTML, Tailwind CSS, Vanilla JavaScript
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **API:** Vercel Serverless Functions (`/api`)
- **Payments:** Razorpay (preferred), PayU (optional)
- **Mapping:** Google Maps Platform (Maps, Places, Geocoding APIs)
- **Hosting:** Vercel (static frontend + serverless backend)
- **Notifications:** Firebase Cloud Messaging (planned)
- **Background Checks:** Indian verification API (planned)

## 📝 Project Structure

```
public/         # All static assets (HTML, CSS, JS, images)
  js/           # Modular JavaScript (signup, login, dashboard, etc.)
  css/          # Tailwind and custom styles
  image/        # Logos, icons, etc.
api/            # Vercel serverless functions (Razorpay, etc.)
supabase/       # Database schema, migrations, edge functions
src/            # (If used) Source files, tests, modules
```

## ⚡ Getting Started

### 1. **Clone the Repository**
```bash
git clone https://github.com/GodBoii/Pawsitive-Strides.git
cd Pawsitive-Strides
```

### 2. **Supabase Setup**
- Create a project at [Supabase](https://supabase.com/).
- Run the SQL schema in `supabase.md` to set up tables, triggers, and RLS.
- Configure Auth settings (Site URL, Redirect URLs, SMTP for custom email).
- Set up Storage buckets if needed for image uploads.

### 3. **Google Maps API**
- Create a project at [Google Cloud Console](https://console.cloud.google.com/).
- Enable Maps JavaScript, Places, and Geocoding APIs.
- Restrict your API key to your domain(s).

### 4. **Razorpay Setup**
- Create a Razorpay account and get your API keys.
- Add them as environment variables in Vercel (see below).

### 5. **Environment Variables (Vercel)**
- In your Vercel project dashboard, add:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - (Optional: `SUPABASE_ANON_KEY` for frontend)
- Redeploy after saving.

### 6. **Run Locally (for development)**
- Use a local server (e.g., VS Code Live Server) to serve files from `public/`.
- Or deploy to Vercel for full serverless/API support.

## 💡 Key User Flows

### **Pet Owner**
1. **Find a Dog Walker:** Choose a plan, register, verify email, pay via Razorpay.
2. **Complete Profile:** Add address, dog profiles, vaccination records, etc.
3. **Book Walks:** Search for walkers, filter by distance/availability, send requests.
4. **Manage:** View/edit profile, manage subscription, booking history, messages.

### **Dog Walker**
1. **Become a Walker:** Choose plan, register, verify email, pay via Razorpay.
2. **Complete Profile:** Add experience, availability, pricing, upload ID/Aadhaar.
3. **Find Jobs:** View nearby walk requests, filter by pay/time, send requests.
4. **Manage:** Edit profile, manage subscription, booking/job history, messages.

## 🔒 Security & Best Practices

- All sensitive keys are stored in environment variables.
- Supabase RLS (Row Level Security) is enabled for all tables.
- Passwords are hashed and never stored in plaintext.
- All communication is over HTTPS.
- Regular security audits and code reviews.

## 🛠️ Development & Contribution

- **Contributions welcome!** Please fork, branch, and submit a pull request.
- See `supabase.md` for the latest database schema and policies.
- For major changes, open an issue first to discuss your proposal.

## 📄 License

Specify your license here (e.g., MIT).

## 📝 Notes

- **Email Verification:** Supabase Auth sends verification emails. To use your own sender, configure SMTP in Supabase Auth settings.
- **Production URLs:** Ensure your Supabase Auth "Site URL" and "Redirect URLs" are set to your Vercel deployment, not localhost.
- **Custom Domains:** For best deliverability, use a custom domain for email and hosting.

## 🙏 Acknowledgements

- Supabase for the backend platform.
- Razorpay for Indian payment integration.
- Google Maps for location services.

**Pawsitive Strides – Making dog walking safe, easy, and joyful for everyone!**