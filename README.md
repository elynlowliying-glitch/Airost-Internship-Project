everyCENT — University Club Budget & Claims Management System

A responsive HTML, CSS and JavaScript web application for managing university club finances, activity budgets and reimbursement claims.

1. Getting Started

Online Access

everyCENT is deployed and accessible online through Firebase Hosting.

- Open the published website URL using a web browser.
- Sign in using an authorised Google account.
- Access the features available according to your assigned user role.

Live Website: https://everycent-404bestiesnotfound.web.app/

Users do not need to download the project, install Visual Studio Code or run Live Server to use the online application.

Local Development

To modify or test the application locally:

1. Download and extract the project ZIP.
2. Open the club-budget-system folder in Visual Studio Code.
3. Install the Live Server extension.
4. Right-click index.html and select Open with Live Server.
5. The application will run locally using the configuration specified in firebase-config.js.

Note: Firebase mode is enabled by default. To explore the prototype without Firebase, set USE_FIREBASE = false in firebase-config.js.

2. Firebase Configuration

The application uses Firebase Authentication and Cloud Firestore to manage user authentication, application data and financial records.

To configure Firebase:

1. Create a project in Firebase Console.
2. Add a Web App and copy its Firebase configuration.
3. Update firebase-config.js with your project configuration.
4. Enable Google as a sign-in provider under Firebase Authentication.
5. Create a Cloud Firestore database.
6. Add the contents of firestore.rules under Firestore Database → Rules and publish them.
7. Add the required development and production domains under Authentication → Settings → Authorized domains.
8. Set USE_FIREBASE = true in firebase-config.js.

3. Google Drive Receipt Upload Setup

Google Drive is used to store reimbursement receipts and supporting documents.

To configure receipt uploads:

1. Enable the Google Drive API in Google Cloud Console.
2. Configure the Google OAuth consent screen.
3. Create a Web OAuth Client ID.
4. Add the local development URL and deployed website domain under Authorized JavaScript origins.
5. Add the OAuth Client ID to drive-config.js.
6. Enter the treasurer's Google email address in drive-config.js.
7. Ensure committee members and the treasurer can authorise the application.
8. Test receipt uploads and confirm that the treasurer can access the uploaded documents.

Receipt Storage:

- Receipt images and PDF documents are uploaded to Google Drive.
- The treasurer is granted permission to view each uploaded receipt.
- Firestore stores the receipt file ID, filename and viewing link.
- Firebase Storage is not used in the current implementation.

4. Register Authorised Users

The application does not allow users to select their own roles.

A trusted club administrator must manually create a document in the Firestore users collection.

The document ID must match the user's Firebase Authentication UID.

Example users/{UID} document:

{
  "fullName": "Jordan Lee",
  "email": "jordan@example.com",
  "profilePicture": "",
  "role": "treasurer"
}

Use "committee" for normal committee members.

Do not allow users to modify their own role.

5. Firestore Collections

The application uses the following collections:

- users: Stores authorised user profiles and roles.
- activities: Stores club activities, descriptions, dates and allocated budgets. Tracks approved expenses and remaining budgets.
- claims: Stores reimbursement submissions, claimant information, receipt links and approval status.
- financialRecords: Stores approved reimbursement transactions for the treasurer.

6. User Roles and Features

Committee Member

- View the club dashboard.
- View registered activities and allocated budgets.
- Submit reimbursement claims.
- Upload receipts and supporting documents.
- View submitted claims.
- Track approval and rejection results.

Treasurer

- View the overall financial dashboard.
- Create and edit club activities.
- Monitor activity budgets and expenditure.
- Review reimbursement claims.
- Approve or reject claims with remarks.
- View financial records.
- Export financial records as CSV.

7. Deployment and Website Updates

everyCENT is hosted using Firebase Hosting, making the application accessible online.

To deploy the application or publish updates:

1. Open the project folder in Visual Studio Code.
2. Open the terminal.
3. Ensure Firebase CLI is installed and you are signed in.
4. Confirm that the project is connected to the correct Firebase project.
5. Save your latest changes.
6. Run the following command:

firebase deploy --only hosting

After deployment is successful, the updated application will be available through the existing Firebase Hosting URL.

Important: Changes made to local files will not automatically appear on the live website. You must deploy the updated files to publish the changes.

If your project uses GitHub for version control, commit and push your changes separately to keep the GitHub repository updated.

8. Important Security Considerations

This project is a starter implementation and should undergo security testing before being used for real financial transactions.

- Restrict access to authorised club members.
- Validate user roles using Firestore security rules.
- Protect personal information and bank account details.
- Validate uploaded documents and enforce file-size limits.
- Implement trusted backend processing for claim approval and budget updates.
- Maintain audit logs and appropriate data-retention policies.
- Test Firestore security rules using the Firebase Emulator.
- Have the university or club IT administrator review the security configuration.

9. Project Files

- index.html — Main application structure and login screen.
- styles.css — Responsive dashboard styling.
- app.js — Authentication, navigation, dashboards, claims and financial management.
- firebase-config.js — Firebase configuration and connection switch.
- drive-config.js — Google Drive OAuth client ID and treasurer email.
- firestore.rules — Firestore database security rules.
- firebase.json — Firebase Hosting configuration.
- README.md — Project setup and documentation.

10. Additional Notes

- Firebase Hosting is used to publish the application online.
- Chart.js is loaded through a CDN.
- Firebase modules are loaded dynamically from Google's CDN.
- Google Identity Services handles Google Drive authorisation.
- Receipt uploads use the Google Drive API.
- CSV export is implemented in the Financial Records page.
- Demo mode provides sample committee and treasurer interfaces without Firebase authentication.
- The online application uses the Firebase configuration and security rules associated with the deployed Firebase project.