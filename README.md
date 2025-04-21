# thirav.ai - OAuth Authentication with Google, GitHub, and LinkedIn

This project demonstrates **OAuth 2.0** authentication with **Google**, **GitHub**, and **LinkedIn** using **Passport.js** in an **Express.js** application. Users can sign in with their Google, GitHub, or LinkedIn accounts, and view their profile information.

---

## Features

- **Sign in with Google, GitHub, and LinkedIn**
- Uses **Passport.js** for OAuth authentication
- Displays user profile information after successful login
- **Redirects** to `/dashboard` upon successful login
- **Protected routes** to restrict access to logged-in users

---

## Prerequisites

Make sure you have the following tools installed:

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- Access to **Google Developer Console**, **GitHub Developer Portal**, and **LinkedIn Developer Portal**

---

## Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/gokulraj0906/thirav.ai
   cd thirav.ai
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Create a `.env` file** in the root directory with the following variables:

   ```env
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   LINKEDIN_CLIENT_ID=your_linkedin_client_id
   LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
   ```

4. **Set up your OAuth credentials** on the following platforms:
   - [Google Developer Console](https://console.cloud.google.com/)
   - [GitHub Developer Portal](https://github.com/settings/applications)
   - [LinkedIn Developer Portal](https://www.linkedin.com/developers/)

5. **Configure Redirect URIs** for each platform in their respective Developer Portals:
   - Google: `http://localhost:3000/auth/google/callback`
   - GitHub: `http://localhost:3000/auth/github/callback`
   - LinkedIn: `http://localhost:3000/auth/linkedin/callback`

6. **Run the application**:

   ```bash
   npm start
   ```

   The app will be live at `http://localhost:3000`.

---

## Usage

1. Visit the application at `http://localhost:3000`.
2. Choose to log in with **Google**, **GitHub**, or **LinkedIn**.
3. Upon successful authentication, you will be redirected to the **dashboard**.
4. Log out using the "Logout" button on the dashboard page.

---

## Routes

- **/auth/google**: Start Google OAuth flow
- **/auth/github**: Start GitHub OAuth flow
- **/auth/linkedin**: Start LinkedIn OAuth flow
- **/auth/google/callback**: Google OAuth callback
- **/auth/github/callback**: GitHub OAuth callback
- **/auth/linkedin/callback**: LinkedIn OAuth callback
- **/dashboard**: Protected route displaying user profile
- **/logout**: Logout route

---

## Contributing

Feel free to fork this repository, create issues, and submit pull requests for any improvements or features you'd like to add.

---

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

---
