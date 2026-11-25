import { firebaseConfig, USE_FIREBASE } from "./firebase-config.js";
import {
  DRIVE_CLIENT_ID,
  TREASURER_EMAIL
} from "./drive-config.js";
let auth, db, googleProvider;
let currentUser = null;
let userProfile = null;
let chartInstance = null;
let selectedClaimId = null;
let localData = {
  activities: [
    {
      id: "act1",
      name: "Tech Innovation Workshop",
      date: "2026-12-08",
      description: "Hands-on technology workshop",
      budget: 5000
    },
    {
      id: "act2",
      name: "Annual Dinner",
      date: "2026-12-18",
      description: "Annual club appreciation dinner",
      budget: 3500
    },
    {
      id: "act3",
      name: "Community Outreach",
      date: "2027-01-12",
      description: "Community volunteering programme",
      budget: 2500
    }
  ],

  claims: [
    {
      id: "CLM-26001",
      uid: "demo-member",
      userId: "demo-member",
      claimant: "Alyssa Tan",
      email: "alyssa@example.com",
      phone: "0123456789",
      activityId: "act1",
      activityName: "Tech Innovation Workshop",
      amount: 320,
      bank: "1234567890",
      description: "Workshop stationery and printing",
      receiptName: "receipt-demo.pdf",
      receiptURL: "",
      submittedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      status: "Pending",
      reviewedBy: "",
      reviewedAt: "",
      rejectionReason: ""
    },
    {
      id: "CLM-26002",
      uid: "demo-member",
      userId: "demo-member",
      claimant: "Alyssa Tan",
      email: "alyssa@example.com",
      phone: "0123456789",
      activityId: "act2",
      activityName: "Annual Dinner",
      amount: 680,
      bank: "1234567890",
      description: "Event decorations",
      receiptName: "decorations.jpg",
      receiptURL: "",
      submittedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      status: "Approved",
      reviewedBy: "Treasurer",
      reviewedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      rejectionReason: ""
    }
  ],

  records: [],
  pendingMembers: []
};
const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value || 0));
const dateText = (value) => value ? new Date(value).toLocaleDateString("en-MY", { day:"2-digit", month:"short", year:"numeric" }) : "—";
const dateTimeText = (value) => value ? new Date(value).toLocaleString("en-MY", { dateStyle:"medium", timeStyle:"short" }) : "—";
const escapeHTML = (str="") => String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
// EVERYCENT EMAIL NOTIFICATIONS
const EMAILJS_SERVICE_ID = "service_od250p5";
const EMAILJS_MEMBER_TEMPLATE_ID = "template_g68srfm";
const EMAILJS_CLAIM_TEMPLATE_ID = "template_ckmrbqt";
const EMAILJS_PUBLIC_KEY = "DVarnk6EtKGEHS1Xv";

let emailJsLoadPromise = null;

async function sendEveryCentEmail(templateId, templateParams) {
  // Load EmailJS only once
  if (!window.emailjs) {
    if (!emailJsLoadPromise) {
      emailJsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/@emailjs/browser@5/dist/email.min.js";

        script.onload = resolve;

        script.onerror = () => {
          reject(new Error("Unable to load EmailJS."));
        };
        document.head.appendChild(script);
      });
    }
    await emailJsLoadPromise;
  }
  return window.emailjs.send(
    EMAILJS_SERVICE_ID,
    templateId,
    templateParams,
    {
      publicKey: EMAILJS_PUBLIC_KEY
    }
  );
}
const isTreasurer = () =>
  userProfile?.role === "treasurer" &&
  userProfile?.approved === true;

function toast(message, type="success") {
  const el = $("#toast"); el.textContent = message; el.className = `toast show ${type}`;
  setTimeout(() => el.className = "toast", 3200);
}

async function initFirebase() {
  if (!USE_FIREBASE) return;

  const appMod = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"
  );

  const authMod = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
  );

  const firestoreMod = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );

  const app = appMod.initializeApp(firebaseConfig);

  auth = authMod.getAuth(app);
  db = firestoreMod.getFirestore(app);
  googleProvider = new authMod.GoogleAuthProvider();

  $("#google-login").addEventListener("click", async () => {
    try {
      await authMod.signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
      toast(error.message, "error");
    }
  });

  authMod.onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      userProfile = null;

      $("#account-status-screen")?.remove();
      showLogin();
      return;
    }

    try {
      currentUser = user;

      const userRef = firestoreMod.doc(
        db,
        "users",
        user.uid
      );

      let snap = await firestoreMod.getDoc(userRef);

      // NEW MEMBER REGISTRATION
      if (!snap.exists()) {
        const newMember = {
          fullName: user.displayName || "New Member",
          email: user.email || "",
          profilePicture: user.photoURL || "",
          role: "pending",
          approved: false,
          registeredAt: new Date().toISOString(),
          approvedAt: "",
          approvedBy: ""
         };

         await firestoreMod.setDoc(userRef, newMember);

        // Confirm that the profile was saved
        const newSnap = await firestoreMod.getDoc(userRef);

        if (!newSnap.exists()) {
          throw new Error("Unable to create your registration request.");
         }

        userProfile = newSnap.data();

        showPendingApproval();
        return;
      }

      userProfile = snap.data();

      // WAITING FOR APPROVAL
      if (
        userProfile.role === "pending" ||
        userProfile.approved === false &&
        userProfile.role !== "rejected"
      ) {
        showPendingApproval();
        return;
      }

      // REGISTRATION REJECTED
      if (userProfile.role === "rejected") {
        showRejectedScreen();
        return;
      }

      // CHECK APPROVED ROLE
      if (
        userProfile.approved !== true ||
        !["committee", "treasurer"].includes(userProfile.role)
      ) {
         throw new Error(
          "Your account is not approved. Contact the treasurer."
        );
      }

      await loadCloudData();
      showApp();

    } catch (error) {
      console.error("Login error:", error);

      toast(
        error.message || "Unable to log in.",
        "error"
      );

      await authMod.signOut(auth);
    }
  });
}



async function loadCloudData() {
  const f = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );
  // 1. All authenticated users can read activities
  const activitiesSnapshot = await f.getDocs(
    f.collection(db, "activities")
  );
  localData.activities = activitiesSnapshot.docs.map(d => {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    totalApprovedExpenses: Number(data.totalApprovedExpenses || 0),
    remainingBudget:
      Number(data.budget || 0) -
      Number(data.totalApprovedExpenses || 0)
  };
});
  // 2. Load claims according to the user's role
  let claimsQuery;
  if (isTreasurer()) {
    // Treasurer can view all claims
    claimsQuery = f.collection(db, "claims");
  } else {
    // Committee members can only view their own claims
    claimsQuery = f.query(
      f.collection(db, "claims"),
      f.where("userId", "==", currentUser.uid)
    );
  }
  const claimsSnapshot = await f.getDocs(claimsQuery);
  localData.claims = claimsSnapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
  // 3. Only treasurer can read financial records
  if (isTreasurer()) {
    const recordsSnapshot = await f.getDocs(
      f.collection(db, "financialRecords")
    );
    localData.records = recordsSnapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
  } else {
    localData.records = [];
  }
  // 4. Load pending members for Treasurer's notification badge
if (isTreasurer()) {
  const usersSnapshot = await f.getDocs(
    f.query(
      f.collection(db, "users"),
      f.where("role", "==", "pending")
    )
  );

  localData.pendingMembers = usersSnapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
    }));
  } else {
    localData.pendingMembers = [];
  }

  refreshNavigationBadges();
}

function showLogin() { $("#login-screen").classList.remove("hidden"); $("#app").classList.add("hidden"); }


function showPendingApproval() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#account-status-screen")?.remove();

  const screen = document.createElement("div");
  screen.id = "account-status-screen";
  screen.className = "account-status-screen";

  screen.innerHTML = `
    <div class="account-status-card">
      <div class="account-status-icon">◷</div>

      <h2>Registration Pending</h2>

      <p>
        Your account has been successfully registered.
        However, your access is currently waiting for
        treasurer approval.
      </p>

      <p>
        <strong>${escapeHTML(currentUser?.email || "")}</strong>
      </p>

      <span class="pill pill-orange">
        Awaiting Approval
      </span>

      <br><br>

      <button id="pending-logout"
        class="btn btn-outline full-width">
        Sign out
      </button>
    </div>
  `;

  document.body.appendChild(screen);

  $("#pending-logout").addEventListener("click", () => {
    $("#logout").click();
  });
}

function showRejectedScreen() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#account-status-screen")?.remove();

  const screen = document.createElement("div");
  screen.id = "account-status-screen";
  screen.className = "account-status-screen";

  screen.innerHTML = `
    <div class="account-status-card rejected">
      <div class="account-status-icon">!</div>

      <h2>Registration Not Approved</h2>

      <p>
        Unfortunately, your registration was not approved.
        Please contact the club treasurer for assistance.
      </p>

      <button id="rejected-logout"
        class="btn btn-outline full-width">
        Sign out
      </button>
    </div>
  `;

  document.body.appendChild(screen);

  $("#rejected-logout").addEventListener("click", () => {
    $("#logout").click();
  });
}

function showApp() {
  $("#login-screen").classList.add("hidden"); $("#app").classList.remove("hidden");
  const name = userProfile?.fullName || currentUser?.displayName || "Club member";
  $("#user-name").textContent = name; $("#user-role").textContent = isTreasurer() ? "Treasurer" : "Committee";
  $("#user-avatar").src = userProfile?.profilePicture || currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
  $("#top-avatar").textContent = name.charAt(0).toUpperCase();
  $("#today-label").textContent = new Date().toLocaleDateString("en-MY", { weekday:"short", day:"numeric", month:"short" });
  buildNavigation(); navigate("Dashboard");
}


function buildNavigation() {
  const items = isTreasurer()
    ? [
        ["Dashboard", "▦"],
        ["Activities", "▤"],
        ["Member Approvals", "♙"],
        ["Claims Approval", "✓"],
        ["Financial Records", "▥"]
      ]
    : [
        ["Dashboard", "▦"],
        ["Activities", "▤"],
        ["Claim", "＋"],
        ["Submitted", "↗"],
        ["Result", "✓"]
      ];

  $("#navigation").innerHTML = items.map(
    ([name, icon]) => `
      <button class="nav-link" data-page="${name}">
        <span>${icon}</span>
        <span class="nav-label">${name}</span>
        <span
          class="nav-badge"
          data-nav-badge="${name}"
          hidden>
        </span>
      </button>
    `
  ).join("");

  $("#navigation")
    .querySelectorAll("button")
    .forEach(btn => {
      btn.addEventListener("click", () => {
        const page = btn.dataset.page;

        markNotificationsViewed(page);
        navigate(page);
      });
    });

  refreshNavigationBadges();
}

// ========================================
// NOTIFICATION READ STATUS
// ========================================

function getSeenNotifications(page) {
  const key = `everyCENT_seen_${currentUser.uid}_${page}`;

  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function markNotificationsViewed(page) {
  if (!currentUser) return;

  let ids = [];

  if (page === "Member Approvals") {
    ids = localData.pendingMembers.map(m => m.id);
  }

  if (page === "Claims Approval") {
    ids = localData.claims
      .filter(c => c.status === "Pending")
      .map(c => c.id);
  }

  if (page === "Result") {
    ids = localData.claims
      .filter(c => ["Approved", "Rejected"].includes(c.status))
      .map(c => c.id);
  }

  const existing = getSeenNotifications(page);
  const updated = [...new Set([...existing, ...ids])];

  localStorage.setItem(
    `everyCENT_seen_${currentUser.uid}_${page}`,
    JSON.stringify(updated)
  );

  refreshNavigationBadges();
}

// Calculate and update sidebar notification counts
function refreshNavigationBadges() {
  if (!userProfile || !currentUser) return;

  const counts = isTreasurer()
    ? {
        "Member Approvals": localData.pendingMembers.filter(
          m => !getSeenNotifications("Member Approvals").includes(m.id)
        ).length,

        "Claims Approval": localData.claims.filter(
          c =>
            c.status === "Pending" &&
            !getSeenNotifications("Claims Approval").includes(c.id)
        ).length
      }
    : {
        "Result": localData.claims.filter(
          c =>
            ["Approved", "Rejected"].includes(c.status) &&
            !getSeenNotifications("Result").includes(c.id)
        ).length
      };

  Object.entries(counts).forEach(([page, count]) => {
    const badge = document.querySelector(
      `[data-nav-badge="${page}"]`
    );

    if (!badge) return;

    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
  });
}

function navigate(page) {
  $("#page-title").textContent = page;
  $("#page-kicker").textContent = isTreasurer() ? "TREASURER WORKSPACE" : "COMMITTEE WORKSPACE";
  $("#navigation").querySelectorAll(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const renderers = {
    "Dashboard": renderDashboard, "Activities": renderActivities, "Member Approvals": renderMemberApprovals,
    "Claim": renderClaimForm,
    "Submitted": () => renderClaimsList(false), "Result": () => renderClaimsList(true),
    "Claims Approval": renderApproval, "Financial Records": renderRecords
  };
  (renderers[page] || renderDashboard)();
  $("#sidebar").classList.remove("sidebar-open");
}

function totals() {
  const personalApproved = localData.claims
    .filter(c => c.status === "Approved")
    .reduce((sum, c) =>
      sum + Number(c.amount || 0), 0
    );
  // Global club expenditure
  const clubExpenses = localData.activities
    .reduce((sum, activity) =>
      sum + activitySpend(activity.id), 0
    );
  const budget = localData.activities
    .reduce((sum, activity) =>
      sum + Number(activity.budget || 0), 0
    );
  const pending = localData.claims
    .filter(c => c.status === "Pending").length;
  return {
    budget,
    expenses: isTreasurer()
      ? clubExpenses
      : personalApproved,
    clubExpenses,
    remaining: budget - clubExpenses,
    pending
  };
}
function activitySpend(activityId) {
  const activity = localData.activities.find(
    a => a.id === activityId
  );
  if (!activity) return 0;
  // Firebase: use the global approved expenditure
  if (USE_FIREBASE) {
    return Number(activity.totalApprovedExpenses || 0);
  }
  // Demo mode: calculate from available demo claims
  return localData.claims
    .filter(c =>
      c.activityId === activityId &&
      c.status === "Approved"
    )
    .reduce((total, claim) =>
      total + Number(claim.amount || 0), 0
    );
}
function statCard(label,value,sub,icon) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${sub}</small></article>`;
}
function renderDashboard() {
  const t = totals();
  const recent = [...localData.claims].sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt)).slice(0,5);
  $("#page-content").innerHTML = `
    <div class="welcome-row"><div><h3>${isTreasurer() ? "Financial overview" : "Welcome back"}${isTreasurer() ? "" : ", "+escapeHTML(userProfile?.fullName?.split(" ")[0] || currentUser?.displayName?.split(" ")[0] || "there")}.</h3><p class="muted">${isTreasurer() ? "Here is what is happening with your club finances." : "Here is a snapshot of your club's activities and finances."}</p></div><span class="pill pill-blue">● Workspace active</span></div>
    <section class="stats-grid">
      ${statCard(isTreasurer()?"Total allocated budget":"Total club budget",money(t.budget),"Across all activities","▤")}
      ${statCard(
        isTreasurer()
          ? "Total club expenses"
          : "Your approved expenses",
        money(t.expenses),
        isTreasurer()
          ? "All approved club claims"
          : "Your approved claims",
        "↗"
      )}
      ${statCard("Remaining budget",money(t.remaining),"Available club allocation","◷")}
      ${isTreasurer()?statCard("Pending claims",String(t.pending),"Awaiting your review","◉"):statCard("Activities",String(localData.activities.length),"Registered club activities","▦")}
    </section>
    <section class="dashboard-grid">
      <article class="panel chart-panel"><div class="panel-heading"><div><h3>Expense distribution</h3><p class="muted">Approved claims by activity</p></div><span class="subtle-tag">This year</span></div><div class="chart-wrap">${localData.activities.length?'<canvas id="expense-chart"></canvas>':'<p class="empty-state">No activities available yet.</p>'}</div></article>
      <article class="panel"><div class="panel-heading"><div><h3>Activity budgets</h3><p class="muted">Spending progress</p></div><button class="text-btn" id="view-activities">View all</button></div>
        <div class="budget-list">${localData.activities.slice(0,4).map(a=>{const spent=activitySpend(a.id),pct=a.budget?Math.min(100,spent/a.budget*100):0;return `<div class="budget-item"><div class="budget-line"><strong>${escapeHTML(a.name)}</strong><span>${money(spent)} / ${money(a.budget)}</span></div><div class="progress"><i style="width:${pct}%"></i></div><small>${pct.toFixed(0)}% used</small></div>`}).join("") || '<p class="empty-state">No activities created yet.</p>'}</div>
      </article>
    </section>
    <article class="panel table-panel"><div class="panel-heading"><div><h3>${isTreasurer()?"Recent claims":"Recent submissions"}</h3><p class="muted">Latest reimbursement activity</p></div></div>${claimsTable(recent,isTreasurer())}</article>`;
  $("#view-activities")?.addEventListener("click",()=>navigate("Activities"));
  const canvas=$("#expense-chart");
  if(canvas && localData.activities.length) {
    chartInstance = new Chart(canvas,{type:"doughnut",data:{labels:localData.activities.map(a=>a.name),datasets:[{data:localData.activities.map(a=>activitySpend(a.id)),backgroundColor:["#5967d9","#23a88a","#f2b45d","#8c78d5","#e17b86"],borderWidth:0,hoverOffset:7}]},options:{maintainAspectRatio:false,cutout:"72%",plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:7,padding:18,font:{family:"DM Sans"}}}}}});
  }
}
function claimsTable(claims,showClaimant) {
  if(!claims.length) return '<p class="empty-state">No claims to display.</p>';
  return `<div class="table-scroll"><table><thead><tr>${showClaimant?'<th>Claimant</th>':''}<th>Activity</th><th>Claim amount</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${claims.map(c=>`<tr>${showClaimant?`<td><strong>${escapeHTML(c.claimant)}</strong></td>`:""}<td>${escapeHTML(c.activityName)}</td><td>${money(c.amount)}</td><td>${dateText(c.submittedAt)}</td><td>${statusBadge(c.status)}</td></tr>`).join("")}</tbody></table></div>`;
}
function statusBadge(status) { return `<span class="status status-${status.toLowerCase()}">${status}</span>`; }


function renderActivities() {
  const canEdit = isTreasurer();
  $("#page-content").innerHTML = `
    <div class="welcome-row">
      <div>
        <h3>Club activities</h3>
        <p class="muted">
          View activity allocations and monitor spending.
        </p>
      </div>
      ${canEdit
        ? '<button class="btn btn-primary" id="add-activity">＋ Create activity</button>'
        : ""}
    </div>
    <div class="activity-grid">
      ${localData.activities.map(a => {
        const spent = activitySpend(a.id);
        const remaining = Number(a.budget) - spent;
        const pct = a.budget
          ? Math.min(100, spent / a.budget * 100)
          : 0;
        return `
          <article class="panel activity-card">
            <div class="activity-card-top">
              <span class="activity-icon">▤</span>
              ${canEdit ? `
                <div class="activity-actions">
                  <button
                    class="more-btn"
                    data-edit="${a.id}"
                    aria-label="Edit activity">
                    Edit
                  </button>

                  <button
                    class="btn btn-danger"
                    data-delete-activity="${a.id}"
                    type="button">
                    Delete
                  </button>
                </div>
              ` : ""}
            </div>
            <h3>${escapeHTML(a.name)}</h3>
            <p class="muted">
              ${escapeHTML(a.description || "No description provided")}
            </p>
            <div class="activity-date">
              ◷ ${dateText(a.date)}
            </div>
            <div class="activity-finance">
              <div>
                <small>Allocated budget</small>
                <strong>${money(a.budget)}</strong>
              </div>
              <div>
                <small>Remaining</small>
                <strong>${money(remaining)}</strong>
              </div>
            </div>
            <div class="progress">
              <i style="width:${pct}%"></i>
            </div>
            <small class="muted">
              ${money(spent)} spent · ${pct.toFixed(0)}% utilised
            </small>

          </article>
        `;
      }).join("") || `
        <p class="empty-state">
          No activities have been created.
        </p>
      `}
    </div>
    <div id="modal-root"></div>
  `;
  // Create activity
  $("#add-activity")?.addEventListener(
    "click",
    () => activityModal()
  );
  // Edit activity
  document.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const activity = localData.activities.find(
        a => a.id === button.dataset.edit
      );

      if (activity) activityModal(activity);
    });
  });
  // Delete activity
  document.querySelectorAll("[data-delete-activity]").forEach(button => {
    button.addEventListener("click", () => {
      deleteActivity(button.dataset.deleteActivity);
    });
  });
}

function activityModal(activity=null) {
  const editing=!!activity;
  $("#modal-root").innerHTML=`<div class="modal-backdrop"><form class="modal" id="activity-form"><div class="modal-head"><h3>${editing?"Edit activity":"Create activity"}</h3><button type="button" class="close-modal">×</button></div><label>Activity name<input name="name" required value="${escapeHTML(activity?.name||"")}"></label><label>Description<textarea name="description" rows="3">${escapeHTML(activity?.description||"")}</textarea></label><div class="form-row"><label>Activity date<input name="date" type="date" required value="${activity?.date||""}"></label><label>Allocated budget (RM)<input name="budget" type="number" min="0.01" step="0.01" required value="${activity?.budget??""}"></label></div><button class="btn btn-primary full-width">${editing?"Save changes":"Create activity"}</button></form></div>`;
  $(".close-modal").addEventListener("click",()=>$("#modal-root").innerHTML="");
  $("#activity-form").addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(e.target),data={name:fd.get("name").trim(),description:fd.get("description").trim(),date:fd.get("date"),budget:Number(fd.get("budget"))};if(editing)Object.assign(activity,data);else localData.activities.push({id:crypto.randomUUID(),...data});if(USE_FIREBASE)await saveActivity(data,activity?.id);$("#modal-root").innerHTML="";toast(editing?"Activity updated":"Activity created");renderActivities();});
}
async function saveActivity(data,id){const f=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");if(id)await f.updateDoc(f.doc(db,"activities",id),data);else await f.addDoc(f.collection(db,"activities"),data);await loadCloudData();refreshNavigationBadges();}

async function deleteActivity(activityId) {
  // Only treasurer can delete activities
  if (!isTreasurer()) {
    toast("You are not authorised to delete activities.", "error");
    return;
  }
  // Find activity
  const activity = localData.activities.find(
    a => a.id === activityId
  );
  if (!activity) {
    toast("Activity not found.", "error");
    return;
  }
  // Prevent deletion if claims are associated with this activity
  const hasClaims = localData.claims.some(
    claim => claim.activityId === activityId
  );
  if (hasClaims) {
    toast(
      "This activity cannot be deleted because it has associated claims.",
      "error"
    );
    return;
  }
  // Confirmation
  const confirmed = await showDeleteConfirmation(
    `Are you sure you want to delete "${activity.name}"? This action cannot be undone.`
  );
  if (!confirmed) return;
  try {
    // Delete from Firestore
    if (USE_FIREBASE) {
      const f = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const activityRef = f.doc(
        db,
        "activities",
        activityId
      );
      // Recheck before deleting
      const snapshot = await f.getDoc(activityRef);
      if (!snapshot.exists()) {
        throw new Error("Activity no longer exists.");
      }
      // Delete activity
      await f.deleteDoc(activityRef);
    }
    // Remove from local application data
    localData.activities = localData.activities.filter(
      a => a.id !== activityId
    );
    toast("Activity deleted successfully.");
    // Refresh activity page
    await loadCloudDataIfNeeded();
    renderActivities();
  } catch (error) {
    console.error("Delete activity error:", error);

    toast(
      error.message || "Unable to delete activity.",
      "error"
    );
  }
}
async function loadCloudDataIfNeeded() {
  if (USE_FIREBASE) {
    await loadCloudData();
  }
}


function getGoogleDriveAccessToken() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error(
        "Google Identity Services has not loaded. Please refresh the page."
      ));
      return;
    }
    const tokenClient =
      google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope:
          "https://www.googleapis.com/auth/drive.file",
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          resolve(response.access_token);
        },
        error_callback: (error) => {
          reject(new Error(
            error.message || "Google authorization failed."
          ));
        }
      });
    tokenClient.requestAccessToken();
  });
}
// Upload receipt to Google Drive
async function uploadReceiptToDrive(file, claimId) {
  // Obtain permission from the member
  const accessToken = await getGoogleDriveAccessToken();
  const boundary = "everyCENT_upload_boundary";
  const metadata = {
    name: `${claimId}_${file.name}`,
    mimeType: file.type,
    description: `everyCENT reimbursement receipt: ${claimId}`
  };
  const body = new Blob([
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${file.type}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ], {
    type: `multipart/related; boundary=${boundary}`
  });
  // Upload the actual receipt
  const uploadResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    }
  );
  if (!uploadResponse.ok) {
    const error = await uploadResponse.json();
    throw new Error(
      error.error?.message || "Receipt upload failed."
    );
  }
  const uploadedFile = await uploadResponse.json();
  // Give the treasurer permission to view the receipt
  for (const email of TREASURER_EMAIL) {
  const permissionResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions?sendNotificationEmail=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "user",
        role: "reader",
        emailAddress: email
      })
    }
  );
  if (!permissionResponse.ok) {
    const error = await permissionResponse.json();

    throw new Error(
      `Unable to grant access to ${email}: ${
        error.error?.message || "Permission failed."
      }`
    );
  }
}
  return {
    receiptDriveFileId: uploadedFile.id,
    receiptURL: uploadedFile.webViewLink,
    receiptName: file.name
  };
}

function renderClaimForm() {
  $("#page-content").innerHTML=`<div class="welcome-row"><div><h3>Submit a reimbursement claim</h3><p class="muted">Provide the details below and attach your proof of payment.</p></div><span class="pill pill-orange">Claims require approval</span></div>
  <form id="claim-form" class="panel form-panel">
    <div class="form-section"><h4>Personal information</h4><div class="form-grid"><label>Full name<input name="claimant" required value="${escapeHTML(userProfile?.fullName||currentUser?.displayName||"")}"></label><label>Phone number<input name="phone" required inputmode="tel" placeholder="e.g. 0123456789"></label></div></div>
    <div class="form-section"><h4>Claim information</h4><div class="form-grid"><label>Activity<select name="activityId" required><option value="">Select an activity</option>${localData.activities.map(a=>`<option value="${a.id}">${escapeHTML(a.name)}</option>`).join("")}</select></label><label>
    Claim amount (RM)
    <input
      name="amount"
      type="number"
      min="0.01"
      step="0.01"
      required
      placeholder="0.00"
    >
    <p id="budget-warning" class="budget-warning hidden"></p>
  </label><label>Bank name
      <input
        name="bankName"
        type="text"
        required
        placeholder="e.g. Maybank, CIMB, Public Bank">
    </label>

    <label>Bank account number
      <input
        name="bank"
        type="text"
        required
        inputmode="numeric"
        pattern="[0-9]{6,20}"
        placeholder="Enter bank account number">
    </label><label class="span-two">Description / reason<textarea name="description" rows="3" required placeholder="Explain what the expense was for..."></textarea></label></div></div>
    <div class="form-section"><h4>Supporting document</h4><label class="upload-box" for="receipt"><span class="upload-icon">↑</span><strong>Choose a receipt or proof of payment</strong><small>PNG, JPG, JPEG or PDF · Maximum 5 MB</small><input id="receipt" name="receipt" type="file" accept=".png,.jpg,.jpeg,.pdf" required></label><p id="file-name" class="muted file-name">No file selected</p></div>
    <div class="form-actions"><p class="muted">Your claim will be marked as pending after submission.</p><button class="btn btn-primary" type="submit">Submit claim →</button></div>
  </form>`;
  
  $("#receipt").addEventListener("change",e=>$("#file-name").textContent=e.target.files[0]?.name||"No file selected");
  // Real-time activity budget checking
function updateClaimBudgetWarning() {
  const form = $("#claim-form");

  const activityId = form.elements.activityId.value;
  const amount = Number(form.elements.amount.value);

  const warning = $("#budget-warning");

  const activity = localData.activities.find(
    a => a.id === activityId
  );

  warning.classList.add("hidden");
  warning.textContent = "";

  if (!activity || !amount || amount <= 0) {
    return;
  }

  const remainingBudget =
    Number(activity.budget || 0) -
    activitySpend(activity.id);

  if (amount > remainingBudget) {
    const exceededAmount = amount - remainingBudget;

    warning.textContent =
      `Budget exceeded! Your claim exceeds the remaining ` +
      `activity budget by ${money(exceededAmount)}. ` +
      `Remaining budget: ${money(remainingBudget)}.`;

    warning.classList.remove("hidden");
  }
}

// Check whenever the activity changes
$("#claim-form").elements.activityId.addEventListener(
  "change",
  updateClaimBudgetWarning
);

// Check whenever the member types an amount
$("#claim-form").elements.amount.addEventListener(
  "input",
  updateClaimBudgetWarning
);
  $("#claim-form").addEventListener("submit",submitClaim);
}

async function submitClaim(e) {
  e.preventDefault();
  const form = e.target;
  const submitButton = form.querySelector(
    'button[type="submit"]'
  );
  // Prevent duplicate submissions
  if (submitButton.disabled) return;
  const originalButtonText = submitButton.textContent;
  const setLoading = (message) => {
    submitButton.disabled = true;
    submitButton.textContent = message;
  };
  const restoreButton = () => {
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  };
  const fd = new FormData(form);
  const file = fd.get("receipt");
  // Validate receipt
  if (!file || file.size > 5 * 1024 * 1024) {
    toast("Please attach a file smaller than 5 MB.", "error");
    return;
  }
  if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
    toast("Only PNG, JPG, JPEG and PDF files are accepted.", "error");
    return;
  }
  const activity = localData.activities.find(
    a => a.id === fd.get("activityId")
  );
  if (!activity) {
    toast("Please select an activity.", "error");
    return;
  }
  const amount = Number(fd.get("amount"));
  if (amount <= 0) {
    toast("Claim amount must be greater than zero.", "error");
    return;
  }
  if (USE_FIREBASE && !currentUser) {
    toast("Please sign in before submitting a claim.", "error");
    return;
  }
  const claim = {
    id: `CLM-${Date.now().toString().slice(-8)}`,
    uid: currentUser?.uid || "demo-member",
    userId: currentUser?.uid || "demo-member",
    claimant: fd.get("claimant").trim(),
    email: currentUser?.email || "demo@example.com",
    phone: fd.get("phone").trim(),
    activityId: activity.id,
    activityName: activity.name,
    amount,
    bankName: fd.get("bankName").trim(),
    bank: fd.get("bank").trim(),
    description: fd.get("description").trim(),
    receiptName: file.name,
    receiptURL: "",
    receiptDriveFileId: "",
    submittedAt: new Date().toISOString(),
    status: "Pending",
    reviewedBy: "",
    reviewedAt: "",
    rejectionReason: ""
  };
  try {
    setLoading("Processing claim...");
    if (USE_FIREBASE) {
      // 1. Upload receipt and grant treasurer access
      setLoading("Uploading receipt...");
      const receipt = await uploadReceiptToDrive(
        file,
        claim.id
      );
      claim.receiptName = receipt.receiptName;
      claim.receiptURL = receipt.receiptURL;
      claim.receiptDriveFileId = receipt.receiptDriveFileId;
      // 2. Save claim information to Firestore
      setLoading("Saving claim...");
      const firestore = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      await firestore.setDoc(
        firestore.doc(db, "claims", claim.id),
        claim
      );
    } else {
      claim.receiptName = file.name;
    }
    // 3. Update local application data
    localData.claims.unshift(claim);
    toast("Your claim has been submitted successfully.");
    navigate("Submitted");
  } catch (err) {
    console.error("Claim submission error:", err);
    toast(
      err.message || "Unable to submit claim. Please try again.",
      "error"
    );
    restoreButton();
  }
}


function renderClaimsList(resultsOnly) {
  let claims = localData.claims.filter(
    c => (c.userId || c.uid) === (currentUser?.uid || "demo-member")
  );
  claims = claims
    .filter(c => resultsOnly
      ? ["Approved", "Rejected"].includes(c.status)
      : true
    )
    .sort((a, b) =>
      new Date(b.submittedAt) - new Date(a.submittedAt)
    );
  $("#page-content").innerHTML = `
    <div class="welcome-row">
      <div>
        <h3>${resultsOnly ? "Claim results" : "Your submissions"}</h3>
        <p class="muted">
          ${resultsOnly
            ? "Final decisions made by the treasurer."
            : "Track the progress of your reimbursement claims."}
        </p>
      </div>
      ${!resultsOnly
        ? '<button class="btn btn-primary" id="new-claim">＋ New claim</button>'
        : ""}
    </div>
    <div class="claim-list">
      ${claims.map(c => `
        <div class="claim-row">
          <span class="claim-symbol">
            ${c.status === "Approved" ? "✓" :
              c.status === "Rejected" ? "×" : "◷"}
          </span>
          <span class="claim-main">
            <strong>${escapeHTML(c.activityName)}</strong>
            <small>${c.id} · Submitted ${dateText(c.submittedAt)}</small>
          </span>
          <span class="claim-amount">
            ${money(c.amount)}
          </span>
          ${statusBadge(c.status)}
          ${c.status === "Pending" && !resultsOnly
            ? `<button
                 class="btn btn-danger delete-claim-btn"
                 data-delete-claim="${c.id}"
                 type="button">
                 Delete
               </button>`
            : ""}
          <button
            class="btn btn-outline"
            data-claim="${c.id}"
            type="button">
            View
          </button>
        </div>
      `).join("") || '<div class="panel empty-state">Nothing here yet.</div>'}
    </div>
    <div id="modal-root"></div>
  `;
  // New claim button
  $("#new-claim")?.addEventListener("click", () => {
    navigate("Claim");
  });
  // View claim details
  document.querySelectorAll("[data-claim]").forEach(button => {
    button.addEventListener("click", () => {
      const claim = localData.claims.find(
        c => c.id === button.dataset.claim
      );

      if (claim) claimDetails(claim, false);
    });
  });
  // Delete pending claim
  document.querySelectorAll("[data-delete-claim]").forEach(button => {
    button.addEventListener("click", () => {
      deleteClaim(button.dataset.deleteClaim);
    });
  });
}

function showDeleteConfirmation(message) {
  return new Promise(resolve => {
    const modal = document.createElement("div");
    modal.className = "custom-confirm-overlay";
    modal.innerHTML = `
      <div class="custom-confirm-box">
        <h3>Delete claim?</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-outline" id="cancel-delete">
            Cancel
          </button>
          <button class="btn btn-danger" id="confirm-delete">
            Delete
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#cancel-delete").onclick = () => {
      modal.remove();
      resolve(false);
    };

    modal.querySelector("#confirm-delete").onclick = () => {
      modal.remove();
      resolve(true);
    };
  });
}

async function deleteClaim(claimId) {
  const claim = localData.claims.find(
    c => c.id === claimId
  );
  // Check whether claim exists
  if (!claim) {
    toast("Claim not found.", "error");
    return;
  }
  // Only the owner can delete their own pending claim
  if (
    (claim.userId || claim.uid) !== currentUser.uid ||
    claim.status !== "Pending"
  ) {
    toast(
      "You can only delete your own pending claims.",
      "error"
    );
    return;
  }
  // Ask for confirmation
  const confirmed = await showDeleteConfirmation(
    "Are you sure you want to delete this pending claim? This action cannot be undone."
  );
  if (!confirmed) return;
  try {
    // Delete from Firestore
    if (USE_FIREBASE) {
      const firestore = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
      );
      const claimRef = firestore.doc(
        db,
        "claims",
        claimId
      );
      await firestore.runTransaction(db, async tx => {
        const claimSnap = await tx.get(claimRef);
        if (!claimSnap.exists()) {
          throw new Error("Claim no longer exists.");
        }
        const latestClaim = claimSnap.data();
        // Recheck ownership and status using latest database data
        if (
          latestClaim.userId !== currentUser.uid ||
          latestClaim.status !== "Pending"
        ) {
          throw new Error(
            "This claim can no longer be deleted."
          );
        }
        tx.delete(claimRef);
      });
    }
    // Remove from local application data
    localData.claims = localData.claims.filter(
      c => c.id !== claimId
    );
    toast("Claim deleted successfully.");
    renderClaimsList(false);
  } catch (error) {
    console.error("Delete claim error:", error);
    toast(
      error.message || "Unable to delete claim.",
      "error"
    );
  }
}

function receiptDocumentHTML(claim) {
  if (!claim.receiptURL) {
    return escapeHTML(claim.receiptName || "No receipt uploaded");
  }
  try {
    const url = new URL(claim.receiptURL);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "drive.google.com"
    ) {
      return "Invalid receipt link";
    }
    return `
      <a
        href="${escapeHTML(url.href)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        View receipt: ${escapeHTML(claim.receiptName || "Receipt")}
      </a>
    `;
  } catch {
    return "Receipt link unavailable";
  }
}

function claimDetails(c, treasurer) {
  selectedClaimId = c.id;

  // Only allow recognised status classes.
  const allowedStatuses = ["Pending", "Approved", "Rejected"];

  const statusClass = allowedStatuses.includes(c.status)
    ? c.status.toLowerCase()
    : "pending";

  const statusMessage =
    c.status === "Pending"
      ? "Awaiting treasurer review"
      : c.status === "Approved"
        ? "Your claim has been approved"
        : c.rejectionReason || "Claim not approved";

  $("#modal-root").innerHTML = `
    <div class="modal-backdrop">
      <section class="modal details-modal">

        <div class="modal-head">
          <h3>Claim details</h3>
          <button class="close-modal" type="button">×</button>
        </div>

        <div class="decision-banner ${statusClass}">
          <strong>${escapeHTML(c.status.toUpperCase())}</strong>
          <small>${escapeHTML(statusMessage)}</small>
        </div>

        <div class="detail-grid">

          ${detail("Claim ID", escapeHTML(c.id || "—"))}

          ${detail("Claimant", escapeHTML(c.claimant || "—"))}

          ${detail("Activity", escapeHTML(c.activityName || "—"))}

          ${detail("Claim amount", money(c.amount))}

          ${detail("Phone number", escapeHTML(c.phone || "—"))}

          ${detail("Bank name", escapeHTML(c.bankName || "—"))}

          ${detail(
            "Bank account",
            c.bank
              ? `•••• ${escapeHTML(String(c.bank).slice(-4))}`
              : "—"
          )}

          ${detail("Submitted", dateTimeText(c.submittedAt))}

          ${detail("Decision date", dateTimeText(c.reviewedAt))}

          <div class="detail-wide">
            ${detail(
              "Description",
              escapeHTML(c.description || "—")
            )}
          </div>

          <div class="detail-wide">
            ${detail(
              "Supporting document",
              receiptDocumentHTML(c)
            )}
          </div>

          ${
            c.rejectionReason
              ? `
                <div class="detail-wide">
                  ${detail(
                    "Treasurer's remarks",
                    escapeHTML(c.rejectionReason)
                  )}
                </div>
              `
              : ""
          }

        </div>

        ${
          treasurer && c.status === "Pending"
            ? `
              <div class="decision-actions">
                <button
                  class="btn btn-danger"
                  id="reject-claim"
                  type="button">
                  Reject claim
                </button>
                <button
                  class="btn btn-success"
                  id="approve-claim"
                  type="button">
                  Approve claim
                </button>
              </div>
              <div id="reject-box" class="hidden">
                <label>
                  Reason for rejection
                  <textarea id="reject-reason" rows="2" placeholder="Provide a clear reason..."></textarea>
                </label>
                <button
                  class="btn btn-danger full-width"
                  id="confirm-reject"
                  type="button">
                  Confirm rejection
                </button>
              </div>
            `
            : ""
        }

      </section>
    </div>
  `;
  // Close claim details modal.
  $(".close-modal").addEventListener("click", () => {
    $("#modal-root").innerHTML = "";
  });

  // Only allow the treasurer to review pending claims.
  if (treasurer && c.status === "Pending") {
    $("#approve-claim").addEventListener("click", () => {
      decideClaim(c, "Approved");
    });
    $("#reject-claim").addEventListener("click", () => {
      $("#reject-box").classList.remove("hidden");
    });
    $("#confirm-reject").addEventListener("click", () => {
      const reason = $("#reject-reason").value.trim();
      if (!reason) {
        toast("Please provide a rejection reason.", "error");
        return;
      }
      decideClaim(c, "Rejected", reason);
    });
  }
}
// Display a detail item.
// The value parameter may contain trusted HTML,
// such as the validated receipt link.
function detail(label, value) {
  return `
    <div class="detail-item">
      <small>${escapeHTML(label)}</small>
      <strong>${value}</strong>
    </div>
  `;
}
async function decideClaim(claim, status, reason = "") {
  if (!isTreasurer() || claim.status !== "Pending") {
    toast("This action is not permitted.", "error");
    return;
  }
  if (
    status === "Approved" &&
    activitySpend(claim.activityId) + Number(claim.amount) >
    Number(
      localData.activities.find(
        a => a.id === claim.activityId
      )?.budget || 0
    )
  ) {
    toast("This claim would exceed the activity budget.", "error");
    return;
  }
  const updated = {
    status,
    reviewedBy:
      userProfile?.fullName ||
      currentUser?.displayName ||
      "Treasurer",
    reviewedAt: new Date().toISOString(),
    rejectionReason: reason
  };
  try {
    if (USE_FIREBASE) {
      // 1. Update claim in Firebase
      await secureDecision(claim, updated);

      // Reload updated claims and activities
      await loadCloudData();
    } else {
      Object.assign(claim, updated);
      refreshNavigationBadges();
    }
    // Only create a local financial record in demo mode.
    // Firebase mode already creates the record in secureDecision().
    if (status === "Approved" && !USE_FIREBASE) {
      localData.records.push({
        id: crypto.randomUUID(),
        claimId: claim.id,
        activityId: claim.activityId,
        activityName: claim.activityName,
        description: claim.description,
        claimant: claim.claimant,
        amount: claim.amount,
        transactionDate: updated.reviewedAt,
        approvedBy: updated.reviewedBy
      });
    }
    // 2. Send email only for approved Firebase claims
    let emailSent = true;

    if (USE_FIREBASE) {
      try {
        await sendEveryCentEmail(
          EMAILJS_CLAIM_TEMPLATE_ID,
          {
            to_email: claim.email,
            to_name: claim.claimant || "Member",

            email_subject:
              status === "Approved"
                ? "Your everyCENT Claim Has Been Approved"
                : "Your everyCENT Claim Has Been Rejected",

            email_message:
              status === "Approved"
                ? `Good news! Your reimbursement claim for ${claim.activityName} has been approved.

    Claim amount: RM ${Number(claim.amount).toFixed(2)}

    Thank you for using everyCENT.`
                : `Unfortunately, your reimbursement claim for ${claim.activityName} has been rejected.

    Claim amount: RM ${Number(claim.amount).toFixed(2)}

    Reason for rejection: ${reason}

    Please contact the treasurer if you need further clarification.`
          }
        );

      } catch (emailError) {
        emailSent = false;
        console.error("Claim notification email failed:", emailError);
      }
    }
    // 3. Show result
    if (!emailSent) {
      toast(
        `Claim ${status.toLowerCase()} successfully, but notification email failed.`,
        "error"
      );
    } else {
       toast(
        `Claim ${status.toLowerCase()} successfully. Notification email sent.`
      );
    }
    $("#modal-root").innerHTML = "";
    navigate("Claims Approval");
  } catch (err) {
    console.error(err);
    toast(
      err.message || "Unable to update claim.",
      "error"
    );
  }
}
async function secureDecision(claim,updated) {
  const f=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  await f.runTransaction(db,async tx=>{
    const claimRef=f.doc(db,"claims",claim.id),activityRef=f.doc(db,"activities",claim.activityId);
    const [claimSnap,activitySnap]=await Promise.all([tx.get(claimRef),tx.get(activityRef)]);
    if (!claimSnap.exists()) {
      throw new Error("Claim no longer exists.");
    }

    if (claimSnap.data().status !== "Pending") {
      throw new Error("This claim has already been reviewed.");
    }

    if (updated.status === "Approved" && !activitySnap.exists()) {
      throw new Error("The activity for this claim no longer exists.");
    }

    if (updated.status === "Approved") {
      const activity = activitySnap.data();
      const spent = Number(activity.totalApprovedExpenses || 0);
      const amount = Number(claim.amount);
      const budget = Number(activity.budget || 0);
      const newTotal = spent + amount;
      const newRemaining = budget - newTotal;
    if (newTotal > budget) {
      throw new Error("Insufficient activity budget.");
    }
    // Update activity expenses
   tx.update(activityRef, {
    totalApprovedExpenses: newTotal,
    remainingBudget: newRemaining
  });
    // Create financial record
  const recordRef = f.doc(db, "financialRecords", claim.id);
  tx.set(recordRef, {
    claimId: claim.id,
    activityId: claim.activityId,
    activityName: claim.activityName,
    description: claim.description,
    claimant: claim.claimant,
    amount: amount,
    transactionDate: updated.reviewedAt,
    approvedBy: updated.reviewedBy
  });
}
    tx.update(claimRef,updated);
  });
}


async function renderMemberApprovals() {
  if (!isTreasurer()) {
    toast("You are not authorised to view this page.", "error");
    return;
  }

  $("#page-content").innerHTML = `
    <div class="welcome-row">
      <div>
        <h3>Member approvals</h3>
        <p class="muted">
          Review registration requests from new committee members.
        </p>
      </div>
      <span class="pill pill-orange" id="pending-member-count">
        Loading...
      </span>
    </div>

    <div id="member-approval-list"
      class="member-approval-list">
      <div class="panel empty-state">
        Loading registration requests...
      </div>
    </div>
  `;

  try {
    const f = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );

    const q = f.query(
      f.collection(db, "users"),
      f.where("role", "==", "pending")
    );

    const snapshot = await f.getDocs(q);

    localData.pendingMembers = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));
    refreshNavigationBadges();

    $("#pending-member-count").textContent =
      `${localData.pendingMembers.length} pending`;

    const container = $("#member-approval-list");

    if (!localData.pendingMembers.length) {
      container.innerHTML = `
        <div class="panel empty-state">
          There are no pending registration requests.
        </div>
      `;
      return;
    }

    container.innerHTML = localData.pendingMembers.map(member => `
      <article class="member-approval-card">
        <div class="member-approval-info">
          <img
            src="${escapeHTML(
              member.profilePicture ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(member.fullName || "Member")}`
            )}"
            alt="Member profile"
          >

          <div>
            <h4>${escapeHTML(member.fullName || "New Member")}</h4>
            <small>${escapeHTML(member.email || "")}</small>
            <br>
            <small>
              Registered: ${dateTimeText(member.registeredAt)}
            </small>
          </div>
        </div>

        <div class="member-approval-actions">
          <button
            class="btn btn-danger"
            data-reject-member="${escapeHTML(member.uid)}">
            Reject
          </button>

          <button
            class="btn btn-success"
            data-approve-member="${escapeHTML(member.uid)}">
            Approve
          </button>
        </div>
      </article>
    `).join("");

    container.querySelectorAll("[data-approve-member]")
      .forEach(button => {
        button.addEventListener("click", () => {
          approveMember(button.dataset.approveMember);
        });
      });

    container.querySelectorAll("[data-reject-member]")
      .forEach(button => {
        button.addEventListener("click", () => {
          rejectMember(button.dataset.rejectMember);
        });
      });

  } catch (error) {
    console.error("Member approval error:", error);

    $("#member-approval-list").innerHTML = `
      <div class="panel empty-state">
        Unable to load registration requests.
      </div>
    `;

    toast(error.message || "Unable to load members.", "error");
  }
}

async function approveMember(uid) {
  if (!isTreasurer()) return;
  try {
    const f = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const memberRef = f.doc(db, "users", uid);
    const snapshot = await f.getDoc(memberRef);
    if (!snapshot.exists() || snapshot.data().role !== "pending") {
      throw new Error("This registration is no longer pending.");
    }
    const member = snapshot.data();
    await f.updateDoc(memberRef, {
      role: "committee",
      approved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: currentUser.uid
    });

    // Send member approval email
    try {
      const member = snapshot.data();

      await sendEveryCentEmail(
        EMAILJS_MEMBER_TEMPLATE_ID,
        {
          to_email: member.email,
          to_name: member.fullName || "Member",
          email_subject: "Your everyCENT Registration Has Been Approved",
          email_message:
            "Good news! Your registration has been approved. You can now sign in to everyCENT using your registered Google account."
        }
      );

      toast("Member approved. Notification email sent.");
    } catch (emailError) {
      console.error("Member approval email failed:", emailError);
      toast("Member approved, but notification email failed.", "error");
    }

    await renderMemberApprovals();
  } catch (error) {
    console.error(error);
    toast(
      error.message || "Unable to approve member.",
      "error"
    );
  }
}

async function rejectMember(uid) {
  if (!isTreasurer()) return;

  console.log("Reject member function called:", uid);

  try {
    const f = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );

    const memberRef = f.doc(db, "users", uid);
    const snapshot = await f.getDoc(memberRef);

    if (!snapshot.exists() || snapshot.data().role !== "pending") {
      throw new Error("This registration is no longer pending.");
    }

    const member = snapshot.data();

    // 1. Update member registration status in Firestore
    await f.updateDoc(memberRef, {
      role: "rejected",
      approved: false,
      approvedBy: currentUser.uid,
      reviewedAt: new Date().toISOString()
    });

    // 2. Send rejection notification email
    let emailSent = true;

    try {
      await sendEveryCentEmail(
        EMAILJS_MEMBER_TEMPLATE_ID,
        {
          to_email: member.email,
          to_name: member.fullName || "Member",

          email_subject:
            "Your everyCENT Registration Has Been Rejected",

          email_message:
            "Unfortunately, your registration for everyCENT has not been approved by the treasurer.\n\nPlease contact the club treasurer if you require further clarification.\n\nThank you for your understanding."
        }
      );

    } catch (emailError) {
      emailSent = false;
      console.error(
        "Member rejection email failed:",
        emailError
      );
    }

    // 3. Display result
    if (emailSent) {
      toast("Registration rejected. Notification email sent.");
    } else {
      toast(
        "Registration rejected, but notification email failed.",
        "error"
      );
    }

    // 4. Refresh member approval list
    await renderMemberApprovals();

  } catch (error) {
    console.error("Member rejection error:", error);

    toast(
      error.message || "Unable to reject member.",
      "error"
    );
  }
}

function renderApproval() {
  const pending=localData.claims.filter(c=>c.status==="Pending");
  const approved=localData.claims.filter(c=>c.status==="Approved");
  const rejected=localData.claims.filter(c=>c.status==="Rejected");
  $("#page-content").innerHTML=`<div class="welcome-row"><div><h3>Claims approval</h3><p class="muted">Review reimbursement requests submitted by committee members.</p></div><span class="pill pill-orange">${pending.length} pending</span></div>
  <div class="tabs"><button class="tab active" data-tab="Pending">Pending <b>${pending.length}</b></button><button class="tab" data-tab="Approved">Approved <b>${approved.length}</b></button><button class="tab" data-tab="Rejected">Rejected <b>${rejected.length}</b></button></div>
  <div id="approval-list" class="claim-list">${approvalRows(pending)}</div><div id="modal-root"></div>`;
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));b.classList.add("active");$("#approval-list").innerHTML=approvalRows(localData.claims.filter(c=>c.status===b.dataset.tab));bindApprovalRows();}));
  bindApprovalRows();
}
function approvalRows(claims){return claims.map(c=>`<button class="claim-row" data-review="${c.id}"><span class="claim-symbol">▤</span><span class="claim-main"><strong>${escapeHTML(c.claimant)} · ${escapeHTML(c.activityName)}</strong><small>${c.id} · ${dateText(c.submittedAt)}</small></span><span class="claim-amount">${money(c.amount)}</span>${statusBadge(c.status)}<span class="row-arrow">›</span></button>`).join("")||'<div class="panel empty-state">No claims in this category.</div>';}
function bindApprovalRows(){document.querySelectorAll("[data-review]").forEach(b=>b.addEventListener("click",()=>claimDetails(localData.claims.find(c=>c.id===b.dataset.review),true)));}

function renderRecords() {
  const rows=localData.records.length?localData.records:localData.claims.filter(c=>c.status==="Approved").map(c=>({...c,transactionDate:c.reviewedAt}));
  $("#page-content").innerHTML=`<div class="welcome-row">
  <div>
    <h3>Financial records</h3>
    <p class="muted">A record of approved club expenditure.</p>
  </div>

  <div class="record-actions">
    <button class="btn btn-outline" id="export-csv">
      ↓ Export CSV
    </button>

    <button class="btn btn-primary" id="download-financial-report">
      <span>↓</span> Download Financial Report
    </button>
  </div>
</div><article class="panel table-panel"><div class="filter-row"><input id="record-search" placeholder="Search claimant or activity..."><select id="record-filter"><option value="">All activities</option>${localData.activities.map(a=>`<option value="${a.id}">${escapeHTML(a.name)}</option>`).join("")}</select></div><div id="records-table">${recordTable(rows)}</div></article>`;
  let filteredRows = [...rows];

  const refresh = () => {
    const q = $("#record-search").value.toLowerCase();
    const id = $("#record-filter").value;

    filteredRows = rows.filter(r =>
      (!id || r.activityId === id) &&
      (`${r.claimant || ""} ${r.activityName || ""}`)
        .toLowerCase()
        .includes(q)
    );

    $("#records-table").innerHTML = recordTable(filteredRows);
  };

  $("#record-search").addEventListener("input", refresh);
  $("#record-filter").addEventListener("change", refresh);
  // Export CSV
  $("#export-csv").addEventListener("click", () => exportCSV(filteredRows));
  // Download PDF financial report
  $("#download-financial-report").addEventListener(
    "click",
    downloadFinancialReport
  );
}

function recordTable(rows){return rows.length?`<div class="table-scroll"><table><thead><tr><th>Transaction</th><th>Activity</th><th>Claimant</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHTML(r.claimId||r.id)}</td><td>${escapeHTML(r.activityName)}</td><td>${escapeHTML(r.claimant)}</td><td>${money(r.amount)}</td><td>${dateText(r.transactionDate)}</td><td>${statusBadge("Approved")}</td></tr>`).join("")}</tbody></table></div>`:'<p class="empty-state">No approved transactions yet.</p>';}
function exportCSV(rows){const headers=["Claim ID","Activity","Claimant","Amount (RM)","Transaction date","Approved by"];const lines=[headers,...rows.map(r=>[r.claimId||r.id,r.activityName,r.claimant,r.amount,r.transactionDate,r.approvedBy||""])];const csv=lines.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="club-financial-records.csv";a.click();URL.revokeObjectURL(url);}

async function downloadFinancialReport() {
  if (!isTreasurer()) {
    toast("You are not authorised to download financial reports.", "error");
    return;
  }

  try {
    toast("Generating financial report...");

    // Load jsPDF from CDN scripts
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("PDF library not loaded. Please refresh the page.");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Check AutoTable plugin
    if (typeof doc.autoTable !== "function") {
      throw new Error("PDF table plugin not loaded. Please refresh the page.");
    }

    // Ensure latest financial information
    if (USE_FIREBASE) {
      await loadCloudData();
    }

    const approvedClaims = localData.claims.filter(
      c => c.status === "Approved"
    );

    const pendingClaims = localData.claims.filter(
      c => c.status === "Pending"
    );

    const rejectedClaims = localData.claims.filter(
      c => c.status === "Rejected"
    );

    const totalBudget = localData.activities.reduce(
      (sum, a) => sum + Number(a.budget || 0), 0
    );

    const totalExpenses = localData.activities.reduce(
      (sum, a) => sum + activitySpend(a.id), 0
    );

    const remainingBudget = totalBudget - totalExpenses;

    const reportDate = new Date().toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    // =========================
    // REPORT HEADER
    // =========================

    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("everyCENT", 14, 20);

    doc.setFontSize(15);
    doc.text("CLUB FINANCIAL REPORT", 14, 32);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${reportDate}`, 14, 40);
    doc.text(
      `Prepared by: ${userProfile?.fullName || "Treasurer"}`,
      14,
      46
    );

    // =========================
    // FINANCIAL SUMMARY
    // =========================

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("1. Financial Summary", 14, 60);

    doc.autoTable({
      startY: 65,
      head: [["Financial Category", "Amount / Count"]],
      body: [
        ["Total Allocated Budget", money(totalBudget)],
        ["Total Approved Expenses", money(totalExpenses)],
        ["Remaining Budget", money(remainingBudget)],
        ["Pending Claims", String(pendingClaims.length)],
        ["Approved Claims", String(approvedClaims.length)],
        ["Rejected Claims", String(rejectedClaims.length)]
      ],
      theme: "grid",
      headStyles: {
        fillColor: [32, 41, 67]
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      }
    });

    // =========================
    // ACTIVITY BREAKDOWN
    // =========================

    let nextY = doc.lastAutoTable.finalY + 15;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("2. Activity Financial Breakdown", 14, nextY);

    const activityRows = localData.activities.map(a => {
      const spent = activitySpend(a.id);
      const budget = Number(a.budget || 0);
      const remaining = budget - spent;
      const utilisation = budget > 0
        ? `${(spent / budget * 100).toFixed(1)}%`
        : "N/A";

      return [
        a.name,
        dateText(a.date),
        money(budget),
        money(spent),
        money(remaining),
        utilisation
      ];
    });

    doc.autoTable({
      startY: nextY + 5,
      head: [[
        "Activity",
        "Date",
        "Budget",
        "Expenses",
        "Remaining",
        "Used"
      ]],
      body: activityRows,
      theme: "grid",
      headStyles: {
        fillColor: [32, 41, 67]
      },
      styles: {
        fontSize: 7,
        cellPadding: 2
      }
    });

    // =========================
    // APPROVED TRANSACTIONS
    // =========================

    nextY = doc.lastAutoTable.finalY + 15;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("3. Approved Financial Transactions", 14, nextY);

    const transactionRows = approvedClaims.map(c => [
      c.id,
      c.claimant,
      c.activityName,
      c.description || "-",
      money(c.amount),
      dateText(c.reviewedAt),
      c.reviewedBy || "-"
    ]);

    doc.autoTable({
      startY: nextY + 5,
      head: [[
        "Claim ID",
        "Claimant",
        "Activity",
        "Description",
        "Amount",
        "Date",
        "Approved By"
      ]],
      body: transactionRows.length
        ? transactionRows
        : [["-", "-", "-", "No approved transactions", "-", "-", "-"]],
      theme: "grid",
      headStyles: {
        fillColor: [32, 41, 67]
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak"
      }
    });

    // =========================
    // FOOTER
    // =========================

    const pageCount = doc.internal.getNumberOfPages();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");

      doc.text(
        `everyCENT | Confidential Financial Report | Page ${i} of ${pageCount}`,
        14,
        290
      );
    }

    // Download PDF
    doc.save(
      `everyCENT-Financial-Report-${new Date().toISOString().slice(0, 10)}.pdf`
    );

    toast("Financial report downloaded successfully.");

  } catch (error) {
    console.error("Financial report error:", error);

    toast(
      error.message || "Unable to generate financial report.",
      "error"
    );
  }
}


$("#logout").addEventListener("click",async()=>{if(USE_FIREBASE){const m=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");await m.signOut(auth);}currentUser=null;userProfile=null;showLogin();});
$("#mobile-menu").addEventListener("click",()=>$("#sidebar").classList.toggle("sidebar-open"));
if(!USE_FIREBASE){
  $("#google-login").addEventListener("click",()=>showDemoChoice());
  showLogin();
}
function showDemoChoice() {
  const existing = $("#demo-modal");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = "demo-modal";
  wrap.className = "modal-backdrop";

  wrap.innerHTML = `
    <section class="modal">
      <div class="modal-head">
        <h3>Preview the workspace</h3>
        <button class="close-modal">×</button>
      </div>

      <p class="muted">
        Choose a sample role to explore the prototype.
        Demo data is stored only in this browser session.
      </p>

      <button class="btn btn-primary full-width" id="demo-committee">
        Continue as committee member
      </button>

      <button class="btn btn-outline full-width" id="demo-treasurer">
        Continue as treasurer
      </button>
    </section>
  `;

  document.body.append(wrap);

  wrap.querySelector(".close-modal").onclick = () => {
    wrap.remove();
  };

  wrap.querySelector("#demo-committee").onclick = () => {
    currentUser = {
      uid: "demo-member",
      displayName: "Alyssa Tan",
      email: "alyssa@example.com"
    };

    userProfile = {
      fullName: "Alyssa Tan",
      role: "committee",
      approved: true,
      profilePicture: ""
    };

    wrap.remove();
    showApp();
  };

  wrap.querySelector("#demo-treasurer").onclick = () => {
    currentUser = {
      uid: "demo-treasurer",
      displayName: "Jordan Lee",
      email: "jordan@example.com"
    };

    userProfile = {
      fullName: "Jordan Lee",
      role: "treasurer",
      approved: true,
      profilePicture: ""
    };

    wrap.remove();
    showApp();
  };
}
if (USE_FIREBASE) {
  initFirebase().catch(error => {
    console.error("Firebase initialization failed:", error);
    toast("Firebase initialization failed. Check the console.", "error");
  });
}

// =========================
// DAY VIEW / NIGHT VIEW
// =========================

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark-mode", isDark);

  document.querySelectorAll(".theme-toggle").forEach(button => {
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to day view" : "Switch to night view"
    );

    button.setAttribute("aria-pressed", String(isDark));
  });

  try {
    localStorage.setItem("everyCENT-theme", theme);
  } catch (error) {
    console.warn("Unable to save theme preference:", error);
  }
}

// Load saved theme
let savedTheme = "light";

try {
  savedTheme = localStorage.getItem("everyCENT-theme") || "light";
} catch (error) {
  console.warn("Unable to load saved theme:", error);
}

applyTheme(savedTheme);

// Handle both login and dashboard theme buttons
document.addEventListener("click", event => {
  const button = event.target.closest(".theme-toggle");

  if (!button) return;

  const isDark = document.body.classList.contains("dark-mode");

  applyTheme(isDark ? "light" : "dark");
});