const STORAGE_KEY = 'hulisi_selected_cards';
const USAGE_STORAGE_KEY = 'hulisi_usage_data';
const ICONS = {
  Zomato: 'images/zomato-icon.svg',
  EazyDiner: 'images/eazydiner-icon.webp',
  BookMyShow: 'images/bookmyshow-icon.webp'
};
const CAROUSEL_IMAGES = {
  Zomato: 'images/carousel-zomato.png',
  EazyDiner: 'images/carousel-eazydiner.png',
  BookMyShow: 'images/carousel-bookmyshow.png'
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let data = {};
let selectedCards = new Set();
let usageData = {};
let carouselInterval = null;
let currentCarouselIndex = 0;

// Initialize
async function init() {
  try {
    const res = await fetch('combined.json');
    data = await res.json();
    
    loadUsageData();
    
    // Check URL params first
    const urlCards = getCardsFromURL();
    if (urlCards.length > 0) {
      selectedCards = new Set(urlCards.filter(k => data[k]));
      saveCards();
    } else {
      loadSavedCards();
    }
    
    renderBanks();
    if (selectedCards.size > 0) {
      showOffers();
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

function getCardsFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cards = params.get('cards');
  return cards ? cards.split(',').map(decodeURIComponent) : [];
}

function updateURL() {
  const cards = [...selectedCards].map(encodeURIComponent).join(',');
  const url = cards ? `${window.location.pathname}?cards=${cards}` : window.location.pathname;
  history.replaceState(null, '', url);
}

function loadSavedCards() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    selectedCards = new Set(JSON.parse(saved));
    selectedCards = new Set([...selectedCards].filter(k => data[k]));
  }
}

function saveCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedCards]));
}

function loadUsageData() {
  const saved = localStorage.getItem(USAGE_STORAGE_KEY);
  usageData = saved ? JSON.parse(saved) : {};
}

function saveUsageData() {
  localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usageData));
}

// Format card name for chips: "BankName CardName (Type)"
function formatCardChip(card) {
  const cardName = card.cardName || 'Any';
  const cardType = card.cardType ? ` (${card.cardType})` : '';
  return `${card.bankName} ${cardName}${cardType}`;
}

// Organize data by bank
function getBankGroups() {
  const banks = {};
  Object.entries(data).forEach(([key, card]) => {
    const bankName = card.bankName || 'Unknown';
    if (!banks[bankName]) banks[bankName] = [];
    banks[bankName].push({ key, ...card });
  });
  return Object.entries(banks).sort((a, b) => a[0].localeCompare(b[0]));
}

// Render bank sections
function renderBanks(filter = '') {
  const banksList = document.getElementById('banksList');
  const groups = getBankGroups();
  const filterLower = filter.toLowerCase();

  banksList.innerHTML = groups.map(([bankName, cards]) => {
    const filteredCards = filter 
      ? cards.filter(c => (c.bankName && c.bankName.toLowerCase().includes(filterLower)) || (c.cardName && c.cardName.toLowerCase().includes(filterLower)))
      : cards;
    if (filteredCards.length === 0) return '';
    
    return `
      <div class="bank-section">
        <div class="bank-name">${bankName}</div>
        <div class="cards-wrap">
          ${filteredCards.map(c => `
            <div class="card-chip ${selectedCards.has(c.key) ? 'selected' : ''}" data-key="${c.key}">
              ${c.cardName || 'Any'}<span class="card-type">${c.cardType ? `(${c.cardType})` : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  banksList.querySelectorAll('.card-chip').forEach(chip => {
    chip.onclick = () => toggleCard(chip.dataset.key);
  });
}

// Toggle card selection
function toggleCard(key) {
  if (selectedCards.has(key)) {
    selectedCards.delete(key);
  } else {
    selectedCards.add(key);
  }
  updateUI();
}

// Update all UI elements
function updateUI() {
  document.querySelectorAll('.card-chip').forEach(chip => {
    chip.classList.toggle('selected', selectedCards.has(chip.dataset.key));
  });
  renderSearchChips();
  document.getElementById('showOffersWrap').classList.toggle('active', selectedCards.size > 0);
  document.getElementById('searchInput').value = "";
}

function renderSearchChips() {
  const wrap = document.getElementById('searchWrap');
  const input = document.getElementById('searchInput');
  wrap.querySelectorAll('.chip').forEach(c => c.remove());
  
  [...selectedCards].forEach(key => {
    const card = data[key];
    if (!card) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${formatCardChip(card)}<span class="remove">×</span>`;
    chip.onclick = () => toggleCard(key);
    wrap.insertBefore(chip, input);
  });
}

// Get offers for selected cards
function getOffers() {
  const offers = [];
  selectedCards.forEach(key => {
    const card = data[key];
    if (!card) return;
    card.discounts.forEach(d => {
      offers.push({
        ...d,
        cardKey: key,
        cardName: card.cardName || 'Any',
        bankName: card.bankName,
        cardType: card.cardType
      });
    });
  });
  return offers;
}

// Get best offer per source
function getBestOffers(offers) {
  const sources = ['Zomato', 'EazyDiner', 'BookMyShow'];
  return sources.map(source => {
    const sourceOffers = offers.filter(o => o.source === source);
    if (sourceOffers.length === 0) return { source, offer: null };
    sourceOffers.sort((a, b) => (b.maxDiscount || 0) - (a.maxDiscount || 0));
    return { source, offer: sourceOffers[0] };
  });
}

// Truncate text to max chars
function truncate(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Carousel - 3 visible cards, infinite rotation with animation
let carouselData = [];
let totalCards = 0;

function startCarouselAnimation(cardCount) {
  if (carouselInterval) clearInterval(carouselInterval);
  if (cardCount === 0) return;
  
  totalCards = cardCount;
  currentCarouselIndex = 0;
  buildCarouselCards();
  updateCarouselPositions();
  
  if (cardCount > 1) {
    carouselInterval = setInterval(nextSlide, 3000);
  }
}

function buildCarouselCards() {
  const track = document.querySelector('.carousel-track');
  if (!track || carouselData.length === 0) return;
  
  // Build all cards once
  track.innerHTML = carouselData.map(({ source, offer }, index) => {
    const cls = source.toLowerCase().replace(/\s/g, '');
    const bgImage = CAROUSEL_IMAGES[source];
    
    if (!offer) {
      return `
        <div class="carousel-card ${cls} disabled" data-index="${index}">
          <img class="bg-image" src="${bgImage}" alt="${source}">
          <div class="offer-overlay">
            <div class="offer-value">No offers available</div>
          </div>
        </div>
      `;
    }
    const offerText = truncate(offer.offer || `Up to ₹${offer.maxDiscount} off`, 16);
    return `
      <div class="carousel-card ${cls}" data-index="${index}">
        <img class="bg-image" src="${bgImage}" alt="${source}">
        <div class="offer-overlay">
          <div class="offer-value">${offerText}</div>
        </div>
      </div>
    `;
  }).join('');
}

function nextSlide() {
  currentCarouselIndex = (currentCarouselIndex + 1) % totalCards;
  updateCarouselPositions();
  updateIndicators();
}

function updateCarouselPositions() {
  const cards = document.querySelectorAll('.carousel-card');
  if (cards.length === 0) return;
  
  const leftIndex = (currentCarouselIndex - 1 + totalCards) % totalCards;
  const centerIndex = currentCarouselIndex;
  const rightIndex = (currentCarouselIndex + 1) % totalCards;
  
  cards.forEach((card, i) => {
    card.classList.remove('left', 'center', 'right', 'hidden');
    
    if (i === leftIndex) {
      card.classList.add('left');
    } else if (i === centerIndex) {
      card.classList.add('center');
    } else if (i === rightIndex) {
      card.classList.add('right');
    } else {
      card.classList.add('hidden');
    }
  });
}

function updateIndicators() {
  document.querySelectorAll('.carousel-indicators .dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentCarouselIndex);
  });
}

function goToSlide(index) {
  currentCarouselIndex = index;
  updateCarouselPositions();
  updateIndicators();
  
  if (carouselInterval) clearInterval(carouselInterval);
  if (totalCards > 1) {
    carouselInterval = setInterval(nextSlide, 3000);
  }
}

// Usage tracking
function getUsageForOffer(cardKey, source) {
  if (!usageData[cardKey] || !usageData[cardKey].discounts) return [];
  const discount = usageData[cardKey].discounts.find(d => d.source === source);
  return discount ? discount.used || [] : [];
}

function getUsageInPeriod(usages, durationInMonths) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - durationInMonths + 1, 1);
  return usages.filter(u => new Date(u.date) >= cutoff);
}

function formatUsageText(usages, usageLimit) {
  if (usages.length === 0) return null;
  
  if (usageLimit && usageLimit.maxUsageCount > 1) {
    const recentUsages = getUsageInPeriod(usages, usageLimit.durationInMonths);
    const monthText = usageLimit.durationInMonths === 1 ? 'month' : `${usageLimit.durationInMonths} months`;
    return `Used ${recentUsages.length}x in last ${monthText}`;
  } else {
    // Get latest usage
    const latest = usages.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const d = new Date(latest.date);
    return `Used on ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
}

function markOfferUsed(cardKey, source, date) {
  if (!usageData[cardKey]) {
    usageData[cardKey] = { discounts: [] };
  }
  
  let discount = usageData[cardKey].discounts.find(d => d.source === source);
  if (!discount) {
    discount = { source, used: [] };
    usageData[cardKey].discounts.push(discount);
  }
  
  discount.used.push({ date: date.toISOString() });
  saveUsageData();
}

function updateOfferUsage(cardKey, source, usageIndex, newDate) {
  if (!usageData[cardKey] || !usageData[cardKey].discounts) return;
  const discount = usageData[cardKey].discounts.find(d => d.source === source);
  if (discount && discount.used && discount.used[usageIndex]) {
    discount.used[usageIndex].date = newDate.toISOString();
    saveUsageData();
  }
}

// Modal for editing date
function showDateModal(cardKey, source, existingDate, usageIndex, onSave) {
  const date = existingDate ? new Date(existingDate) : new Date();
  let day = date.getDate();
  let month = date.getMonth();
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Edit Usage Date</h3>
      <div class="modal-field">
        <label>Day</label>
        <div class="modal-input-group">
          <button type="button" data-action="day-minus">−</button>
          <input type="number" id="modalDay" value="${day}" min="1" max="31">
          <button type="button" data-action="day-plus">+</button>
        </div>
      </div>
      <div class="modal-field">
        <label>Month</label>
        <div class="modal-input-group">
          <button type="button" data-action="month-minus">−</button>
          <select id="modalMonth">
            ${MONTHS.map((m, i) => `<option value="${i}" ${i === month ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <button type="button" data-action="month-plus">+</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" data-action="cancel">Cancel</button>
        <button class="btn-save" data-action="save">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const dayInput = overlay.querySelector('#modalDay');
  const monthSelect = overlay.querySelector('#modalMonth');
  
  overlay.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    
    if (action === 'day-minus') {
      dayInput.value = Math.max(1, parseInt(dayInput.value) - 1);
    } else if (action === 'day-plus') {
      dayInput.value = Math.min(31, parseInt(dayInput.value) + 1);
    } else if (action === 'month-minus') {
      monthSelect.value = Math.max(0, parseInt(monthSelect.value) - 1);
    } else if (action === 'month-plus') {
      monthSelect.value = Math.min(11, parseInt(monthSelect.value) + 1);
    } else if (action === 'cancel') {
      overlay.remove();
    } else if (action === 'save') {
      const newDate = new Date(new Date().getFullYear(), parseInt(monthSelect.value), parseInt(dayInput.value));
      onSave(newDate);
      overlay.remove();
    }
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Render offers screen
function showOffers() {
  saveCards();
  updateURL();
  
  document.getElementById('hero').classList.add('hidden');
  document.getElementById('selection').classList.remove('active');
  document.getElementById('offers').classList.add('active');
  document.getElementById('navbar').classList.add('active');
  document.getElementById('navbarBack').classList.remove('hidden');

  const offers = getOffers();
  const bestOffers = getBestOffers(offers);

  // Render header chips
  const chipsHtml = [...selectedCards].map(key => {
    const card = data[key];
    if (!card) return '';
    return `<span class="chip" data-key="${key}">${formatCardChip(card)}</span>`;
  }).join('');
  document.getElementById('offerChips').innerHTML = chipsHtml;
  document.getElementById('offerChips').querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => showSelection();
  });

  // Store carousel data and render
  carouselData = bestOffers;
  
  const indicatorsHtml = bestOffers.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
  
  document.getElementById('carouselContainer').innerHTML = `
    <div class="carousel-wrapper">
      <div class="carousel-track"></div>
    </div>
    <div class="carousel-indicators">${indicatorsHtml}</div>
  `;
  
  // Bind dot clicks
  document.querySelectorAll('.carousel-indicators .dot').forEach(dot => {
    dot.onclick = () => goToSlide(parseInt(dot.dataset.index));
  });
  
  startCarouselAnimation(bestOffers.length);

  // Render offers list (sorted by maxDiscount)
  const sortedOffers = [...offers].sort((a, b) => (b.maxDiscount || 0) - (a.maxDiscount || 0));
  document.getElementById('offersList').innerHTML = sortedOffers.length === 0 
    ? `<div class="empty-state"><p>No offers found for selected cards</p></div>`
    : sortedOffers.map((o, i) => {
      const icon = ICONS[o.source] || '';
      const usageText = o.usageLimit ? `${o.usageLimit.maxUsageCount}x/${o.usageLimit.durationInMonths}mo` : '';
      const applicableText = o.applicableOn ? o.applicableOn.join(', ') : '';
      const cardDisplayName = `${o.cardName}${o.cardType ? ` (${o.cardType})` : ''}`;
      
      // Get usage info
      const usages = getUsageForOffer(o.cardKey, o.source);
      const usedText = formatUsageText(usages, o.usageLimit);
      
      return `
        <div class="offer-card" data-index="${i}" data-card-key="${o.cardKey}" data-source="${o.source}">
          <div class="offer-main">
            <div class="offer-top">
              <div class="offer-left">
                <img class="source-icon" src="${icon}" alt="${o.source}">
                <div class="offer-title">${o.offer || `₹${o.maxDiscount} off`}</div>
              </div>
              <div class="offer-right">
                <div class="offer-bank-name">${o.bankName}</div>
                <div class="offer-card-name">${cardDisplayName}</div>
              </div>
            </div>
            <div class="offer-meta">
              <div class="offer-details">
                ${applicableText ? `<span>On: ${applicableText}</span>` : ''}
                ${o.maxDiscount ? `<span>Max Discount: ₹${o.maxDiscount}</span>` : ''}
                ${o.minBillAmount ? `<span>Min bill: ₹${o.minBillAmount}</span>` : ''}
                ${usageText ? `<span>Usage Limit: ${usageText}</span>` : ''}
                <span class="view-detail">View Details ▾</span>
              </div>
              <div class="offer-actions">
                ${usedText 
                  ? `<span class="used-info">${usedText} <span class="edit-icon" data-action="edit-usage">✎</span></span>`
                  : `<button class="btn-mark-used" data-action="mark-used">Mark Used</button>`
                }
              </div>
            </div>
          </div>
          <div class="offer-expanded">
            <p class="offer-text">${o.offerText || 'No additional details'}</p>
          </div>
        </div>
      `;
    }).join('');

  // Bind events
  document.querySelectorAll('.offer-card').forEach(card => {
    const cardKey = card.dataset.cardKey;
    const source = card.dataset.source;
    
    // Expand/collapse on view detail click
    card.querySelector('.offer-details .view-detail').onclick = (e) => {
      e.stopPropagation();
      card.querySelector('.offer-expanded').classList.toggle('active');
      const btn = card.querySelector('.view-detail');
      btn.textContent = card.querySelector('.offer-expanded').classList.contains('active') ? 'Hide Details ▴' : 'View Details ▾';
    };
    
    // Mark used button
    const markUsedBtn = card.querySelector('[data-action="mark-used"]');
    if (markUsedBtn) {
      markUsedBtn.onclick = (e) => {
        e.stopPropagation();
        markOfferUsed(cardKey, source, new Date());
        showOffers(); // Re-render
      };
    }
    
    // Edit usage
    const editBtn = card.querySelector('[data-action="edit-usage"]');
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        const usages = getUsageForOffer(cardKey, source);
        const latestIndex = usages.length - 1;
        const latestDate = usages[latestIndex]?.date;
        
        showDateModal(cardKey, source, latestDate, latestIndex, (newDate) => {
          updateOfferUsage(cardKey, source, latestIndex, newDate);
          showOffers(); // Re-render
        });
      };
    }
  });
}

// Show selection screen
function showSelection() {
  if (carouselInterval) clearInterval(carouselInterval);
  
  document.getElementById('hero').classList.add('hidden');
  document.getElementById('offers').classList.remove('active');
  document.getElementById('selection').classList.add('active');
  document.getElementById('navbar').classList.add('active');
  document.getElementById('navbarBack').classList.add('hidden');
  
  // Clear URL params when going back to selection
  history.replaceState(null, '', window.location.pathname);
  
  renderBanks();
  updateUI();
}

// Event listeners
document.getElementById('findOffersBtn').onclick = showSelection;
document.getElementById('showOffersBtn').onclick = showOffers;
document.getElementById('navbarBack').onclick = showSelection;
document.getElementById('searchInput').oninput = (e) => renderBanks(e.target.value);

// Start
init();