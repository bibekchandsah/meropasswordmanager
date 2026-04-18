# 🔐 Password Manager Web App — AI Agent Instructions

## 🎯 Objective

Build a **fully functional, production-ready password manager web application** with:

* Strong security (zero-knowledge architecture)
* Premium, modern UI/UX
* React-based frontend (PWA supported for mobile)
* Scalable backend
* End-to-end encryption

---

# 🧱 1. Tech Stack Requirements

## Frontend (MANDATORY)

* React (prefer Next.js)
* TypeScript
* Tailwind CSS (for premium UI)
* Zustand or Redux (state management)
* React Query / TanStack Query (data fetching)
* Framer Motion (animations)
* PWA support (service worker + manifest)

## Backend

* Node.js with Express OR NestJS
* TypeScript
* REST API (or GraphQL optional)

## Database

* PostgreSQL (main DB)
* Redis (sessions + caching)
* use supabase

## Security / Crypto

* Use `libsodium` or Web Crypto API
* AES-256 encryption (client-side)
* Argon2 or PBKDF2 (key derivation)

## Deployment

* Dockerized app
* Cloud-ready (AWS / GCP / Azure compatible)
* vercel & railway

---

# 🔐 2. Security Architecture (CRITICAL)

## Zero-Knowledge Model

* Server must NEVER see plaintext passwords
* All encryption happens on client side

## Encryption Flow

1. User enters master password
2. Derive encryption key using Argon2
3. Encrypt vault data using AES-256
4. Send ONLY encrypted data to backend

## Authentication

* Store only hashed master password (Argon2)
* Implement JWT-based session system
* Add optional 2FA (TOTP)

## Additional Security

* Auto logout after inactivity
* Clipboard auto-clear after copying password
* Rate limiting on login
* Device/IP anomaly detection (basic version)

---

# 🎨 3. UI/UX Requirements (Premium Feel)

## Design Style

* Clean, modern (similar to top SaaS apps)
* Dark + Light mode
* Smooth animations (Framer Motion)
* Glassmorphism / soft shadows / rounded corners

## Pages

### 1. Landing Page

* Product intro
* Features showcase
* Call-to-action (Sign Up / Login)

### 2. Auth Pages

* Login
* Register
* Master password setup

### 3. Dashboard (Main Vault)

* Sidebar navigation
* Search bar (instant filtering)
* Password cards (site with favicon view, username, masked password)

### 4. Add/Edit Password Modal

* Fields:

  * Site/App name
  * Username
  * Password
  * Notes
* Password generator button

### 5. Settings Page

* user profile picture: add/remove
* user name:
* user email:
* Change master password
* Enable TOTP 2FA
* Theme toggle
* Export/Import vault
* change password if logged in from email manually after verifying
* delete account after verifying
* logout

---

# ⚙️ 4. Core Features

## MVP Features

* User authentication
* Store encrypted credentials
* Add/Edit/Delete passwords
* Search passwords
* Password generator
* Copy to clipboard

## Advanced Features

* Password strength checker
* Secure notes storage
* Auto-lock vault
* Multi-device sync
* Offline support (PWA)
* Activity logs (basic)

---

# 📱 5. PWA Requirements

* Add `manifest.json`
* Enable service worker (offline support)
* Installable on mobile (Add to Home Screen)
* Responsive UI (mobile-first design)

---

# 🔄 6. API Design

## Auth APIs

* POST /auth/register
* POST /auth/login
* POST /auth/logout

## Vault APIs

* GET /vault
* POST /vault
* PUT /vault/:id
* DELETE /vault/:id

⚠️ All vault data must be encrypted before sending.

---

# 🗄️ 7. Database Schema

## Users Table

* id
* email
* password_hash
* created_at

## Vault Table

* id
* user_id
* encrypted_data (TEXT)
* updated_at

---

# ⚡ 8. Performance & Scalability

* Use pagination for vault data
* Cache sessions in Redis
* Stateless backend design
* Prepare for horizontal scaling

---

# 🧪 9. Testing Requirements

* Unit tests for encryption logic
* API tests
* UI component tests
* Basic security testing (rate limit, auth)

---

# 🚀 10. Deployment

* Use Docker
* Setup environment variables securely
* Enable HTTPS (SSL)
* Use CDN for frontend

---

# 🧠 11. Code Quality Rules

* Use modular architecture
* Write reusable components
* Follow clean code principles
* Add comments for complex logic
* Avoid hardcoding secrets

---

# ⚠️ 12. Strict Rules (DO NOT VIOLATE)

* ❌ Never store plaintext passwords
* ❌ Never send unencrypted sensitive data
* ❌ Never log sensitive data
* ❌ Never expose encryption keys

---

# 🧩 13. Bonus Enhancements (Optional)

* Browser extension (autofill)
* Biometric authentication (via WebAuthn)
* Dark web breach check API
* Secure password sharing

---

# 🏁 Final Deliverable

The AI agent must produce:

1. Fully working frontend (React + PWA)
2. Fully working backend (API + DB)
3. Secure encryption implementation
4. Clean UI with premium feel
5. Deployment-ready project

---

# 📌 Final Instruction

Prioritize in this order:

1. Security
2. Stability
3. User Experience
4. Features

Build the app as if it will handle **millions of users and highly sensitive data**.

---

END OF INSTRUCTIONS
