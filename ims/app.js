import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const env = window.__ENV || {};
const firebaseConfig = env.firebase || {};

const statusEl = document.getElementById("firebaseStatus");
const toastEl = document.getElementById("toast");

const isConfigured =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes("YOUR_") &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.includes("YOUR_");

let db = null;
let firebaseReady = false;

if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
  statusEl.textContent = "Firebase: connected";
  refreshAll();
} else {
  statusEl.textContent = "Firebase: add config in env.js";
}

const state = {
  categories: [],
  units: [],
  vendors: [],
  items: [],
  purchases: [],
  consumptions: [],
  returns: [],
  adjustments: []
};

const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
const featureButtons = Array.from(document.querySelectorAll(".feature-btn"));
const pages = Array.from(document.querySelectorAll(".page"));
const featurePanels = Array.from(document.querySelectorAll(".feature-panel"));

const categoryForm = document.getElementById("categoryForm");
const unitForm = document.getElementById("unitForm");
const vendorForm = document.getElementById("vendorForm");
const itemForm = document.getElementById("itemForm");

const purchaseForm = document.getElementById("purchaseForm");
const returnForm = document.getElementById("returnForm");
const adjustmentForm = document.getElementById("adjustmentForm");

const purchaseItem = document.getElementById("purchaseItem");
const purchaseQty = document.getElementById("purchaseQty");
const purchaseTotal = document.getElementById("purchaseTotal");

const itemCategory = document.getElementById("itemCategory");
const itemUnit = document.getElementById("itemUnit");
const itemVendor = document.getElementById("itemVendor");
const itemHasExpiry = document.getElementById("itemHasExpiry");
const expiryRow = document.getElementById("expiryRow");

const returnItem = document.getElementById("returnItem");
const adjustItem = document.getElementById("adjustItem");

const consumptionList = document.getElementById("consumptionList");

const statTotalItems = document.getElementById("statTotalItems");
const statLowStock = document.getElementById("statLowStock");
const statOutStock = document.getElementById("statOutStock");
const statSpend = document.getElementById("statSpend");
const lowStockList = document.getElementById("lowStockList");
const outStockList = document.getElementById("outStockList");
const expiryList = document.getElementById("expiryList");
const activityList = document.getElementById("activityList");

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

let purchaseTotalManual = false;

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.style.background = isError ? "#b4442f" : "#1f4d4c";
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}

function escapeHTML(value) {
  if (!value) return "";
  return String(value).replace(/[&<>"']/g, (match) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[match] || match;
  });
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function timeValue(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "";
}

function ensureFirebase() {
  if (!firebaseReady) {
    showToast("Add Firebase config in env.js", true);
    return false;
  }
  return true;
}

async function fetchCollection(name) {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

async function refreshAll() {
  if (!firebaseReady) return;
  try {
    const [
      categories,
      units,
      vendors,
      items,
      purchases,
      consumptions,
      returns,
      adjustments
    ] = await Promise.all([
      fetchCollection("categories"),
      fetchCollection("units"),
      fetchCollection("vendors"),
      fetchCollection("items"),
      fetchCollection("purchases"),
      fetchCollection("consumptions"),
      fetchCollection("returns"),
      fetchCollection("adjustments")
    ]);

    state.categories = categories;
    state.units = units;
    state.vendors = vendors;
    state.items = items;
    state.purchases = purchases;
    state.consumptions = consumptions;
    state.returns = returns;
    state.adjustments = adjustments;

    renderSelects();
    renderConsumption();
    renderStats();
    updatePurchaseTotal();
  } catch (error) {
    if (error?.code === "permission-denied") {
      showToast("Permission denied. Set Firestore rules to allow public access.", true);
    } else {
      showToast("Failed to load data", true);
    }
    console.error(error);
  }
}

function renderSelect(selectEl, items, labelFn, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = "";

  if (!items.length) {
    const option = document.createElement("option");
    option.textContent = placeholder || "No options";
    option.value = "";
    option.disabled = true;
    option.selected = true;
    selectEl.appendChild(option);
    selectEl.disabled = true;
    return;
  }

  selectEl.disabled = false;
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = labelFn(item);
    selectEl.appendChild(option);
  });

  if (items.some((item) => item.id === current)) {
    selectEl.value = current;
  }
}

function getVendorName(id) {
  return state.vendors.find((vendor) => vendor.id === id)?.name || "Unknown";
}

function getUnitName(id) {
  return state.units.find((unit) => unit.id === id)?.displayName || "";
}

function getCategoryName(id) {
  return state.categories.find((category) => category.id === id)?.name || "Uncategorized";
}

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function renderSelects() {
  renderSelect(itemCategory, state.categories, (category) => category.name, "Create category first");
  renderSelect(itemUnit, state.units, (unit) => `${unit.displayName} (${unit.unitName})`, "Create unit first");
  renderSelect(itemVendor, state.vendors, (vendor) => vendor.name, "Create vendor first");

  renderSelect(purchaseItem, state.items, (item) => `${item.name} — ${getVendorName(item.vendorId)}`, "Create item first");
  renderSelect(returnItem, state.items, (item) => item.name, "Create item first");
  renderSelect(adjustItem, state.items, (item) => item.name, "Create item first");
}

function renderConsumption() {
  if (!state.items.length) {
    consumptionList.innerHTML = "<div class=\"list-empty\">Create items to start logging consumption.</div>";
    return;
  }

  const categories = [...state.categories].sort((a, b) => a.name.localeCompare(b.name));
  const itemsByCategory = new Map();

  categories.forEach((category) => itemsByCategory.set(category.id, []));
  itemsByCategory.set("uncategorized", []);

  state.items.forEach((item) => {
    const key = item.categoryId && itemsByCategory.has(item.categoryId) ? item.categoryId : "uncategorized";
    itemsByCategory.get(key).push(item);
  });

  const blocks = [];

  categories.forEach((category) => {
    const items = itemsByCategory.get(category.id) || [];
    blocks.push(renderCategoryBlock(category.name, items));
  });

  const uncategorizedItems = itemsByCategory.get("uncategorized") || [];
  if (uncategorizedItems.length) {
    blocks.push(renderCategoryBlock("Uncategorized", uncategorizedItems));
  }

  consumptionList.innerHTML = blocks.join("");
}

function renderCategoryBlock(title, items) {
  if (!items.length) {
    return `
      <div class="category-block">
        <h4>${escapeHTML(title)}</h4>
        <div class="list-empty">No items yet.</div>
      </div>
    `;
  }

  const rows = items
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => {
      const stockQty = toNumber(item.stockQty);
      const unitName = getUnitName(item.unitId);
      const vendorName = getVendorName(item.vendorId);
      return `
        <div class="item-row">
          <div class="item-meta">
            <div class="item-name">${escapeHTML(item.name)}</div>
            <div class="item-sub">Stock: ${stockQty} ${escapeHTML(unitName)} · Vendor: ${escapeHTML(vendorName)}</div>
          </div>
          <div class="item-actions">
            <input type="number" class="qty-input" min="1" value="1" />
            <button class="action-btn consume" data-action="consume" data-item-id="${item.id}" title="Consume">+</button>
            <button class="action-btn undo" data-action="undo" data-item-id="${item.id}" title="Undo">-</button>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="category-block">
      <h4>${escapeHTML(title)}</h4>
      ${rows}
    </div>
  `;
}

function renderStats() {
  const totalItems = state.items.length;
  const lowStockItems = state.items.filter((item) => {
    const qty = toNumber(item.stockQty);
    const level = toNumber(item.reorderLevel);
    return qty > 0 && qty <= level;
  });
  const outStockItems = state.items.filter((item) => toNumber(item.stockQty) <= 0);

  statTotalItems.textContent = totalItems;
  statLowStock.textContent = lowStockItems.length;
  statOutStock.textContent = outStockItems.length;

  const totalSpend = state.purchases.reduce((sum, purchase) => sum + toNumber(purchase.totalAmount), 0);
  statSpend.textContent = currencyFormatter.format(totalSpend);

  renderList(lowStockList, lowStockItems, (item) => {
    const unitName = getUnitName(item.unitId);
    return `${escapeHTML(item.name)} (${toNumber(item.stockQty)} ${escapeHTML(unitName)})`;
  });

  renderList(outStockList, outStockItems, (item) => `${escapeHTML(item.name)} (0)`);

  renderExpiryAlerts();
  renderActivity();
}

function renderList(container, items, labelFn) {
  if (!items.length) {
    container.innerHTML = "<div class=\"list-empty\">Nothing to show.</div>";
    return;
  }

  container.innerHTML = items
    .map((item) => `
      <div class="list-item">
        <strong>${labelFn(item)}</strong>
      </div>
    `)
    .join("");
}

function renderExpiryAlerts() {
  const today = new Date();
  const warningDays = 14;

  const expiring = state.items
    .filter((item) => item.hasExpiry && item.expiryDate)
    .map((item) => {
      const expiry = toDate(item.expiryDate);
      const diffDays = expiry ? Math.ceil((expiry - today) / (1000 * 60 * 60 * 24)) : null;
      return { item, expiry, diffDays };
    })
    .filter(({ diffDays }) => diffDays !== null && diffDays <= warningDays);

  if (!expiring.length) {
    expiryList.innerHTML = "<div class=\"list-empty\">No expiry alerts in the next 14 days.</div>";
    return;
  }

  expiryList.innerHTML = expiring
    .sort((a, b) => a.diffDays - b.diffDays)
    .map(({ item, expiry, diffDays }) => {
      const label = `${escapeHTML(item.name)} · ${diffDays} day(s)`;
      return `
        <div class="list-item">
          <strong>${label}</strong>
          <span>${formatDate(expiry)}</span>
        </div>
      `;
    })
    .join("");
}

function renderActivity() {
  const activities = [];

  state.purchases.forEach((purchase) => {
    activities.push({
      type: "Purchase",
      label: `${getItem(purchase.itemId)?.name || "Item"} · Qty ${toNumber(purchase.quantity)}`,
      time: purchase.createdAt
    });
  });

  state.consumptions.forEach((consumption) => {
    const qty = toNumber(consumption.quantity);
    const label = `${getItem(consumption.itemId)?.name || "Item"} · ${qty >= 0 ? "Consumed" : "Undo"} ${Math.abs(qty)}`;
    activities.push({
      type: "Consumption",
      label,
      time: consumption.createdAt
    });
  });

  state.returns.forEach((entry) => {
    activities.push({
      type: "Return",
      label: `${getItem(entry.itemId)?.name || "Item"} · Qty ${toNumber(entry.quantity)}`,
      time: entry.createdAt
    });
  });

  state.adjustments.forEach((entry) => {
    const direction = entry.direction === "increase" ? "Increase" : "Decrease";
    activities.push({
      type: "Adjustment",
      label: `${getItem(entry.itemId)?.name || "Item"} · ${direction} ${toNumber(entry.quantity)}`,
      time: entry.createdAt
    });
  });

  if (!activities.length) {
    activityList.innerHTML = "<div class=\"list-empty\">No activity yet.</div>";
    return;
  }

  const sorted = activities
    .sort((a, b) => timeValue(b.time) - timeValue(a.time))
    .slice(0, 10);

  activityList.innerHTML = sorted
    .map((activity) => `
      <div class="list-item">
        <div>
          <strong>${escapeHTML(activity.type)}</strong>
          <div class="muted">${escapeHTML(activity.label)}</div>
        </div>
        <span>${formatDate(activity.time)}</span>
      </div>
    `)
    .join("");
}

function updatePurchaseTotal() {
  if (!state.items.length) return;
  if (purchaseTotalManual) return;
  const item = getItem(purchaseItem.value);
  const qty = toNumber(purchaseQty.value) || 1;
  const total = item ? qty * toNumber(item.price) : 0;
  purchaseTotal.value = total.toFixed(2);
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    navButtons.forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.page;
    pages.forEach((page) => page.classList.toggle("active", page.id === target));
  });
});

featureButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.feature;
    featurePanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.featurePanel === target));
  });
});

itemHasExpiry.addEventListener("change", () => {
  expiryRow.style.display = itemHasExpiry.checked ? "flex" : "none";
});

expiryRow.style.display = "none";

purchaseItem.addEventListener("change", () => {
  purchaseTotalManual = false;
  updatePurchaseTotal();
});

purchaseQty.addEventListener("input", updatePurchaseTotal);

purchaseTotal.addEventListener("input", () => {
  purchaseTotalManual = true;
});

consumptionList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (!ensureFirebase()) return;

  const action = button.dataset.action;
  const itemId = button.dataset.itemId;
  const row = button.closest(".item-row");
  const qtyInput = row?.querySelector(".qty-input");
  const qty = Math.max(1, toNumber(qtyInput?.value || 1));
  const delta = action === "consume" ? qty : -qty;

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, "items", itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error("Item not found");
      const itemData = itemSnap.data();
      const currentStock = toNumber(itemData.stockQty);
      const newStock = currentStock - delta;

      if (delta > 0 && newStock < 0) {
        throw new Error("Insufficient stock");
      }

      tx.update(itemRef, { stockQty: newStock });
      const logRef = doc(collection(db, "consumptions"));
      tx.set(logRef, {
        itemId,
        quantity: delta,
        createdAt: serverTimestamp()
      });
    });
    await refreshAll();
    showToast("Consumption updated");
  } catch (error) {
    showToast(error.message || "Consumption failed", true);
  }
});

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const name = document.getElementById("categoryName").value.trim();
  const description = document.getElementById("categoryDescription").value.trim();

  if (!name) {
    showToast("Category name required", true);
    return;
  }

  try {
    await addDoc(collection(db, "categories"), {
      name,
      description,
      createdAt: serverTimestamp()
    });
    categoryForm.reset();
    await refreshAll();
    showToast("Category created");
  } catch (error) {
    showToast("Failed to create category", true);
  }
});

unitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const displayName = document.getElementById("unitDisplay").value.trim();
  const unitName = document.getElementById("unitName").value.trim();

  if (!displayName || !unitName) {
    showToast("Unit fields required", true);
    return;
  }

  try {
    await addDoc(collection(db, "units"), {
      displayName,
      unitName,
      createdAt: serverTimestamp()
    });
    unitForm.reset();
    await refreshAll();
    showToast("Unit created");
  } catch (error) {
    showToast("Failed to create unit", true);
  }
});

vendorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const payload = {
    name: document.getElementById("vendorName").value.trim(),
    address: document.getElementById("vendorAddress").value.trim(),
    mobile: document.getElementById("vendorMobile").value.trim(),
    email: document.getElementById("vendorEmail").value.trim(),
    openingBalance: toNumber(document.getElementById("vendorOpening").value),
    createdAt: serverTimestamp()
  };

  if (!payload.name) {
    showToast("Vendor name required", true);
    return;
  }

  try {
    await addDoc(collection(db, "vendors"), payload);
    vendorForm.reset();
    await refreshAll();
    showToast("Vendor created");
  } catch (error) {
    showToast("Failed to create vendor", true);
  }
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const categoryId = itemCategory.value;
  const unitId = itemUnit.value;
  const vendorId = itemVendor.value;

  if (!categoryId || !unitId || !vendorId) {
    showToast("Select category, unit, and vendor", true);
    return;
  }

  const payload = {
    categoryId,
    unitId,
    vendorId,
    name: document.getElementById("itemName").value.trim(),
    hasExpiry: itemHasExpiry.checked,
    expiryDate: itemHasExpiry.checked && document.getElementById("itemExpiryDate").value
      ? new Date(document.getElementById("itemExpiryDate").value)
      : null,
    openingQty: toNumber(document.getElementById("itemOpeningQty").value),
    price: toNumber(document.getElementById("itemPrice").value),
    reorderLevel: toNumber(document.getElementById("itemReorder").value),
    stockQty: toNumber(document.getElementById("itemOpeningQty").value),
    createdAt: serverTimestamp()
  };

  if (!payload.name) {
    showToast("Item name required", true);
    return;
  }

  try {
    await addDoc(collection(db, "items"), payload);
    itemForm.reset();
    itemHasExpiry.checked = false;
    expiryRow.style.display = "none";
    await refreshAll();
    showToast("Item created");
  } catch (error) {
    showToast("Failed to create item", true);
  }
});

purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const itemId = purchaseItem.value;
  const quantity = toNumber(purchaseQty.value);
  const totalAmount = toNumber(purchaseTotal.value);

  if (!itemId || quantity <= 0) {
    showToast("Select item and quantity", true);
    return;
  }

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, "items", itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error("Item not found");
      const itemData = itemSnap.data();
      const currentStock = toNumber(itemData.stockQty);
      const newStock = currentStock + quantity;

      tx.update(itemRef, { stockQty: newStock });
      const purchaseRef = doc(collection(db, "purchases"));
      tx.set(purchaseRef, {
        itemId,
        vendorId: itemData.vendorId || null,
        quantity,
        totalAmount,
        createdAt: serverTimestamp()
      });
    });

    purchaseForm.reset();
    purchaseTotalManual = false;
    await refreshAll();
    showToast("Purchase saved");
  } catch (error) {
    showToast("Purchase failed", true);
  }
});

returnForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const itemId = returnItem.value;
  const quantity = toNumber(document.getElementById("returnQty").value);
  const reason = document.getElementById("returnReason").value.trim();

  if (!itemId || quantity <= 0 || !reason) {
    showToast("Return details required", true);
    return;
  }

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, "items", itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error("Item not found");
      const itemData = itemSnap.data();
      const currentStock = toNumber(itemData.stockQty);
      const newStock = currentStock - quantity;

      if (newStock < 0) {
        throw new Error("Insufficient stock for return");
      }

      tx.update(itemRef, { stockQty: newStock });
      const returnRef = doc(collection(db, "returns"));
      tx.set(returnRef, {
        itemId,
        quantity,
        reason,
        createdAt: serverTimestamp()
      });
    });

    returnForm.reset();
    await refreshAll();
    showToast("Return logged");
  } catch (error) {
    showToast(error.message || "Return failed", true);
  }
});

adjustmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureFirebase()) return;

  const itemId = adjustItem.value;
  const direction = document.getElementById("adjustType").value;
  const quantity = toNumber(document.getElementById("adjustQty").value);
  const reason = document.getElementById("adjustReason").value.trim();

  if (!itemId || quantity <= 0 || !reason) {
    showToast("Adjustment details required", true);
    return;
  }

  const delta = direction === "increase" ? quantity : -quantity;

  try {
    await runTransaction(db, async (tx) => {
      const itemRef = doc(db, "items", itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists()) throw new Error("Item not found");
      const itemData = itemSnap.data();
      const currentStock = toNumber(itemData.stockQty);
      const newStock = currentStock + delta;

      if (newStock < 0) {
        throw new Error("Insufficient stock for adjustment");
      }

      tx.update(itemRef, { stockQty: newStock });
      const adjustRef = doc(collection(db, "adjustments"));
      tx.set(adjustRef, {
        itemId,
        quantity,
        direction,
        reason,
        createdAt: serverTimestamp()
      });
    });

    adjustmentForm.reset();
    await refreshAll();
    showToast("Adjustment saved");
  } catch (error) {
    showToast(error.message || "Adjustment failed", true);
  }
});

refreshAll();



