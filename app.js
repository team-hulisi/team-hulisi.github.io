const STORAGE_KEY = 'hulisi_selected_cards';
const ICONS = {
  Zomato: 'images/zomato-icon.svg',
  EazyDiner: 'images/eazydiner-icon.svg',
  BookMyShow: 'images/bookmyshow-icon.webp'
};
const CAROUSEL_IMAGES = {
  Zomato: 'images/carousel-zomato.png',
  EazyDiner: 'images/carousel-eazydiner.png',
  BookMyShow: 'images/carousel-bookmyshow.png'
};

let data = {};
let selectedCards = new Set();
let carouselInterval = null;
let currentCarouselIndex = 0;

// Initialize
async function init() {
  try {
    const res = await fetch('combined.json');
    data = await res.json();
    
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
              ${c.cardName || 'Any'}<span class="card-type">${c.cardType || ''}</span>
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
    chip.innerHTML = `${card.bankName} ${card.cardName || 'Any'}<span class="remove">×</span>`;
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
    return `
      <div class="carousel-card ${cls}" data-index="${index}">
        <img class="bg-image" src="${bgImage}" alt="${source}">
        <div class="offer-overlay">
          <div class="offer-value">${offer.offer || `Up to ₹${offer.maxDiscount} off`}</div>
        </div>
        <div class="card-name">${offer.bankName} ${offer.cardName}</div>
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
    return `<span class="chip" data-key="${key}">${card.bankName} ${card.cardName || 'Any'}</span>`;
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
      const cls = o.source.toLowerCase().replace(/\s/g, '');
      const icon = ICONS[o.source] || '';
      const usageText = o.usageLimit ? `${o.usageLimit.maxUsageCount}x/${o.usageLimit.durationInMonths}mo` : '';
      const applicableText = o.applicableOn ? o.applicableOn.join(', ') : '';
      return `
        <div class="offer-card" data-index="${i}">
          <div class="offer-main">
            <div class="offer-top">
              <div class="offer-source">
                <img class="source-icon" src="${icon}" alt="${o.source}">
                <span class="source-label">${o.source}</span>
              </div>
              <div class="offer-discount">${o.offer || `₹${o.maxDiscount} off`}</div>
            </div>
            <div class="offer-meta">
              <div class="offer-details">
                ${applicableText ? `<span>On: ${applicableText}</span>` : ''}
                ${o.maxDiscount ? `<span>Max: ₹${o.maxDiscount}</span>` : ''}
                ${o.minBillAmount ? `<span>Min bill: ₹${o.minBillAmount}</span>` : ''}
                ${usageText ? `<span>Limit: ${usageText}</span>` : ''}
              </div>
              <span class="view-detail">View Details ▾</span>
            </div>
          </div>
          <div class="offer-expanded">
            <p class="offer-text">${o.offerText || 'No additional details'}</p>
            <p class="offer-card-name">Card: ${o.bankName} ${o.cardName} ${o.cardType || ''}</p>
          </div>
        </div>
      `;
    }).join('');

  // Bind expand/collapse
  document.querySelectorAll('.offer-card').forEach(card => {
    card.querySelector('.offer-main').onclick = () => {
      card.querySelector('.offer-expanded').classList.toggle('active');
      const btn = card.querySelector('.view-detail');
      btn.textContent = card.querySelector('.offer-expanded').classList.contains('active') ? 'Hide Details ▴' : 'View Details ▾';
    };
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