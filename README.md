everyCENT — University Club Budget & Claims Management System

A responsive HTML, CSS and JavaScript web application for managing university club finances, activity budgets and reimbursement claims.

1. Getting Started

Download and extract the project ZIP.
Open the club-budget-system folder in Visual Studio Code.
Install the Live Server extension.
Right-click index.html and select Open with Live Server.
The application will open using the configuration specified in firebase-config.js.
Note: Firebase mode is enabled by default. To explore the prototype without Firebase, set USE_FIREBASE = false in firebase-config.js.

2. Firebase Configuration

Create a project in Firebase Console.
Add a Web App and copy its Firebase configuration.
Update firebase-config.js with your project configuration.
Enable Google as a sign-in provider under Firebase Authentication.
Create a Cloud Firestore database.
Add the contents of firestore.rules under Firestore Database → Rules and publish them.
Add your development domain (e.g. localhost) under Authentication → Settings → Authorized domains.
Set USE_FIREBASE = true in firebase-config.js.

3. Google Drive Receipt Upload Setup

Google Drive is used to store reimbursement receipts and supporting documents.
Enable the Google Drive API in Google Cloud Console.
Configure the Google OAuth consent screen.

Create a Web OAuth Client ID.
Add your website's development URL under Authorized JavaScript origins.
Add the OAuth Client ID to drive-config.js.
Enter the treasurer's Google email address in drive-config.js.
Ensure committee members and the treasurer can authorise the application.
Test receipt uploads and confirm that the treasurer can access the uploaded documents.

Receipt storage:
Receipt images and PDF documents are uploaded to Google Drive.
The treasurer is granted permission to view each uploaded receipt.
Firestore stores the receipt file ID, filename and viewing link.
Firebase Storage is not used in the current implementation.

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

users
Stores authorised user profiles and roles.

activities
Stores club activities, descriptions, dates and allocated budgets.
Tracks approved expenses and remaining budgets.

claims
Stores reimbursement submissions, claimant information, receipt links and approval status.
financialRecords
Stores approved reimbursement transactions for the treasurer.

6. User Roles and Features

Committee Member
View the club dashboard.
View registered activities and allocated budgets.
Submit reimbursement claims.
Upload receipts and supporting documents.
View submitted claims.
Track approval and rejection results.

Treasurer
View the overall financial dashboard.
Create and edit club activities.
Monitor activity budgets and expenditure.
Review reimbursement claims.
Approve or reject claims with remarks.
View financial records.
Export financial records as CSV.

7. Important Security Considerations
This project is a starter implementation and should undergo security testing before being used for real financial transactions.
Restrict access to authorised club members.
Validate user roles using Firestore security rules.
Protect personal information and bank account details.
Validate uploaded documents and enforce file-size limits.
Implement trusted backend processing for claim approval and budget updates.
Maintain audit logs and appropriate data-retention policies.
Test Firestore security rules using the Firebase Emulator.
Have the university or club IT administrator review the security configuration.

8. Project Files
index.html — Main application structure and login screen.
styles.css — Responsive dashboard styling.
app.js — Authentication, navigation, dashboards, claims and financial management.
firebase-config.js — Firebase configuration and connection switch.
drive-config.js — Google Drive OAuth client ID and treasurer email.
firestore.rules — Firestore database security rules.
README.md — Project setup and documentation.

9. Additional Notes
Chart.js is loaded through a CDN.
Firebase modules are loaded dynamically from Google's CDN.
Google Identity Services handles Google Drive authorisation.
Receipt uploads use the Google Drive API.
CSV export is implemented in the Financial Records page.
Demo mode provides sample committee and treasurer interfaces without Firebase authentication.