//皇居
const fallbackLat = 35.685175;
const fallbackLng = 139.752800;

const addressHistoryStorageKey = 'howLargeIsThisAreaAddressHistory';
const comparisonTargetStorageKey = 'howLargeIsThisAreaComparisonTargets';
const selectionDataVersion = 1;
const maxAddressHistoryCount = 8;
const maxOperationHistoryCount = 80;
const minDrawDistanceMeters = 2;

const defaultAreaColors = [
    '#2563eb',
    '#16a34a',
    '#9333ea',
    '#f59e0b',
    '#dc2626',
    '#0891b2',
    '#db2777',
    '#4f46e5',
    '#65a30d',
    '#ea580c'
];

const pointMarkerIcon = L.divIcon({
    className: 'point-marker-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

const map = L.map('map', {
    minZoom: 2,
    maxZoom: 20,
    zoomControl: false
}).setView([fallbackLat, fallbackLng], 18);

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors'
});

const gsiStdLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '地理院タイル'
});

const gsiPaleLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '地理院タイル'
});

const gsiPhotoLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
    maxZoom: 18,
    attribution: '地理院タイル'
});

const baseMapLayers = {
    'OpenStreetMap': osmLayer,
    '地理院地図 標準': gsiStdLayer,
    '地理院地図 淡色': gsiPaleLayer,
    '地理院 写真': gsiPhotoLayer
};

let currentBaseLayerName = 'OpenStreetMap';

osmLayer.addTo(map);
createLayerSwitcherControl().addTo(map);

const points = [];
const markers = [];
const fixedAreas = [];
const operationTimeline = [];

let lineLayer = null;
let isAllConfirmed = false;

let lastAreaM2 = null;
let lastSimpleAreaM2 = null;
let lastOverlapAreaM2 = null;
let lastTotalPerimeterM = null;
let lastUniquePerimeterM = null;

let selectionMode = 'click';
let lastSelectionMode = 'click';

let isDrawing = false;
let isDraggingPoint = false;
let activeDrawPointerId = null;
let currentDragPointCount = 0;
let currentAreaHasDragPoint = false;
let currentAreaColor = null;

let addressMarker = null;
let currentLocationMarker = null;
let cachedCurrentLocation = null;

let addressHistory = [];
let savedComparisonTargets = [];

let historyPointer = -1;
let isRestoringHistory = false;

const clickModeButton = document.getElementById('clickModeButton');
const drawModeButton = document.getElementById('drawModeButton');
const modeOverlay = document.getElementById('modeOverlay');

const confirmButton = document.getElementById('confirmButton');
const nextAreaButton = document.getElementById('nextAreaButton');
const undoButton = document.getElementById('undoButton');
const resetButton = document.getElementById('resetButton');
const copyResultButton = document.getElementById('copyResultButton');
const exportCsvButton = document.getElementById('exportCsvButton');
const saveSelectionDataButton = document.getElementById('saveSelectionDataButton');
const loadSelectionDataButton = document.getElementById('loadSelectionDataButton');
const selectionDataFileInput = document.getElementById('selectionDataFileInput');
const selectionDataMessage = document.getElementById('selectionDataMessage');

const result = document.getElementById('result');
const pointList = document.getElementById('pointList');
const areaList = document.getElementById('areaList');
const operationHistoryList = document.getElementById('operationHistoryList');

const comparisonSelect = document.getElementById('comparisonSelect');
const customAreaBox = document.getElementById('customAreaBox');
const customName = document.getElementById('customName');
const customArea = document.getElementById('customArea');
const comparisonManager = document.getElementById('comparisonManager');
const saveComparisonButton = document.getElementById('saveComparisonButton');
const updateComparisonButton = document.getElementById('updateComparisonButton');
const deleteComparisonButton = document.getElementById('deleteComparisonButton');
const comparisonManageMessage = document.getElementById('comparisonManageMessage');

const addressInput = document.getElementById('addressInput');
const addressSearchButton = document.getElementById('addressSearchButton');
const currentLocationButton = document.getElementById('currentLocationButton');
const clearCurrentLocationMarkerButton = document.getElementById('clearCurrentLocationMarkerButton');
const clearAddressMarkerButton = document.getElementById('clearAddressMarkerButton');
const clearAddressHistoryButton = document.getElementById('clearAddressHistoryButton');
const addressSearchMessage = document.getElementById('addressSearchMessage');
const addressCandidateList = document.getElementById('addressCandidateList');
const addressHistoryList = document.getElementById('addressHistoryList');

const guideToggleButton = document.getElementById('guideToggleButton');
const guidePanel = document.getElementById('guidePanel');

const mapContainer = map.getContainer();

clickModeButton.addEventListener('click', function () {
    setSelectionMode('click');
});

drawModeButton.addEventListener('click', function () {
    setSelectionMode('draw');
});

guideToggleButton.addEventListener('click', function () {
    const isOpen = !guidePanel.hidden;

    guidePanel.hidden = isOpen;
    guideToggleButton.setAttribute('aria-expanded', String(!isOpen));
    guideToggleButton.textContent = isOpen ?
        '使い方ガイドを表示' :
        '使い方ガイドを閉じる';
});

addressSearchButton.addEventListener('click', function () {
    searchAddress();
});

addressInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        searchAddress();
    }
});

currentLocationButton.addEventListener('click', function () {
    moveToCurrentLocation(false, false);
});

clearCurrentLocationMarkerButton.addEventListener('click', clearCurrentLocationMarker);
clearAddressMarkerButton.addEventListener('click', clearAddressMarker);
clearAddressHistoryButton.addEventListener('click', clearAddressHistory);
copyResultButton.addEventListener('click', copyResultToClipboard);
exportCsvButton.addEventListener('click', exportResultToCsv);
saveSelectionDataButton.addEventListener('click', saveSelectionDataToFile);

loadSelectionDataButton.addEventListener('click', function () {
    selectionDataFileInput.value = '';
    selectionDataFileInput.click();
});

selectionDataFileInput.addEventListener('change', handleSelectionDataFileSelected);

map.on('click', function (e) {
    if (isAllConfirmed || isDraggingPoint || selectionMode !== 'click') {
        return;
    }

    addClickPoint(e.latlng);
});

mapContainer.addEventListener('pointerdown', handleDrawPointerDown);
mapContainer.addEventListener('pointermove', handleDrawPointerMove);
mapContainer.addEventListener('pointerup', handleDrawPointerUp);
mapContainer.addEventListener('pointercancel', handleDrawPointerCancel);
mapContainer.addEventListener('lostpointercapture', handleDrawPointerCancel);

confirmButton.addEventListener('click', confirmAllAreas);
nextAreaButton.addEventListener('click', setNextArea);
undoButton.addEventListener('click', undoPoint);
resetButton.addEventListener('click', resetAll);

comparisonSelect.addEventListener('change', handleComparisonSelectionChanged);
saveComparisonButton.addEventListener('click', saveCustomComparisonTarget);
updateComparisonButton.addEventListener('click', updateSelectedComparisonTarget);
deleteComparisonButton.addEventListener('click', deleteSelectedComparisonTarget);

customName.addEventListener('input', function () {
    updateComparisonManageButtons();
    refreshResultIfNeeded();
});

customArea.addEventListener('input', function () {
    updateComparisonManageButtons();
    refreshResultIfNeeded();
});

updateModeOverlay();
updateAddressMarkerButton();
updateCurrentLocationMarkerButton();
loadAddressHistory();
renderAddressHistory();
loadSavedComparisonTargets();
renderSavedComparisonOptions();
handleComparisonSelectionChanged();
resetOperationTimeline('初期状態');
moveToCurrentLocation(true, false);

function cutDownToSecondDecimal(value) {
    return Math.trunc(value * 100) / 100;
}

function formatResultNumber(value) {
    const cutDownValue = cutDownToSecondDecimal(Number(value) || 0);

    return new Intl.NumberFormat('ja-JP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(cutDownValue);
}

function formatLength(valueM) {
    if (valueM >= 1000) {
        return `${formatResultNumber(valueM / 1000)} km`;
    }

    return `${formatResultNumber(valueM)} m`;
}

function normalizeAreaColor(value) {
    const color = String(value || '').trim();

    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
        return color.toLowerCase();
    }

    return defaultAreaColors[0];
}

function getDefaultAreaColor(index) {
    return defaultAreaColors[index % defaultAreaColors.length];
}

function resetOperationTimeline(label) {
    operationTimeline.length = 0;
    historyPointer = -1;

    operationTimeline.push({
        label: label,
        createdAt: new Date().toISOString(),
        visible: false,
        snapshot: captureSnapshot()
    });

    historyPointer = 0;
    renderOperationHistory();
    updateButtons();
}

function recordOperation(label) {
    if (isRestoringHistory) {
        return;
    }

    if (historyPointer < operationTimeline.length - 1) {
        operationTimeline.splice(historyPointer + 1);
    }

    operationTimeline.push({
        label: label,
        createdAt: new Date().toISOString(),
        visible: true,
        snapshot: captureSnapshot()
    });

    while (operationTimeline.filter(item => item.visible).length > maxOperationHistoryCount) {
        const removableIndex = operationTimeline.findIndex(item => item.visible);

        if (removableIndex <= 0) {
            break;
        }

        operationTimeline.splice(removableIndex, 1);
    }

    historyPointer = operationTimeline.length - 1;
    renderOperationHistory();
    updateButtons();
}

function captureSnapshot() {
    return {
        points: points.map(p => ({ lat: p.lat, lng: p.lng })),
        markerFlags: markers.map(marker => marker !== null),
        fixedAreas: fixedAreas.map(area => ({
            name: area.name,
            color: area.color,
            points: area.points.map(p => ({ lat: p.lat, lng: p.lng })),
            markerFlags: area.markerFlags.map(flag => flag),
            selectionMode: area.selectionMode,
            lastSelectionMode: area.lastSelectionMode,
            wasDragArea: area.wasDragArea,
            areaM2: area.areaM2,
            perimeterM: area.perimeterM
        })),
        isAllConfirmed: isAllConfirmed,
        selectionMode: selectionMode,
        lastSelectionMode: lastSelectionMode,
        currentAreaHasDragPoint: currentAreaHasDragPoint,
        currentAreaColor: currentAreaColor,
        lastAreaM2: lastAreaM2,
        lastSimpleAreaM2: lastSimpleAreaM2,
        lastOverlapAreaM2: lastOverlapAreaM2,
        lastTotalPerimeterM: lastTotalPerimeterM,
        lastUniquePerimeterM: lastUniquePerimeterM,
        resultHtml: result.innerHTML
    };
}

function restoreSnapshot(snapshot) {
    isRestoringHistory = true;

    removeCurrentDrawingLayers();

    points.length = 0;
    markers.length = 0;
    fixedAreas.length = 0;

    isAllConfirmed = snapshot.isAllConfirmed;
    selectionMode = snapshot.selectionMode || 'click';
    lastSelectionMode = snapshot.lastSelectionMode || 'click';
    currentAreaHasDragPoint = snapshot.currentAreaHasDragPoint || false;
    currentAreaColor = snapshot.currentAreaColor ? normalizeAreaColor(snapshot.currentAreaColor) : null;
    isDrawing = false;
    isDraggingPoint = false;
    activeDrawPointerId = null;
    currentDragPointCount = 0;

    lastAreaM2 = snapshot.lastAreaM2;
    lastSimpleAreaM2 = snapshot.lastSimpleAreaM2;
    lastOverlapAreaM2 = snapshot.lastOverlapAreaM2;
    lastTotalPerimeterM = snapshot.lastTotalPerimeterM;
    lastUniquePerimeterM = snapshot.lastUniquePerimeterM;

    snapshot.points.forEach((p, index) => {
        const latlng = L.latLng(p.lat, p.lng);
        points.push(latlng);

        if (snapshot.markerFlags[index]) {
            markers.push(createPointMarker(latlng));
        } else {
            markers.push(null);
        }
    });

    snapshot.fixedAreas.forEach((areaData, index) => {
        fixedAreas.push(recreateFixedAreaFromSnapshot(areaData, isAllConfirmed, index));
    });

    refreshAllPointMarkers();
    drawOpenLine();

    if (isAllConfirmed) {
        releaseSelectionMode();
    } else {
        setSelectionMode(selectionMode === 'none' ? lastSelectionMode : selectionMode);
    }

    result.innerHTML = snapshot.resultHtml || 'まだ面積は計算されていません。';

    updateAreaList();
    updatePointList();
    updateButtons();
    updateModeOverlay();

    isRestoringHistory = false;
}

function recreateFixedAreaFromSnapshot(areaData, isFinalArea, areaIndex) {
    const areaPoints = areaData.points.map(p => L.latLng(p.lat, p.lng));
    const fixedFeatureCollection = createFeatureCollectionForCurrentArea(areaPoints);
    const areaM2 = calculateFeatureCollectionArea(fixedFeatureCollection);
    const perimeterM = calculateFeatureCollectionPerimeterM(fixedFeatureCollection);
    const areaColor = normalizeAreaColor(areaData.color || getDefaultAreaColor(areaIndex));

    const polygonLayer = L.geoJSON(fixedFeatureCollection, {
        style: createAreaStyle(areaColor, isFinalArea)
    }).addTo(map);

    const areaName = areaData.name || `範囲${areaIndex + 1}`;

    polygonLayer.bindPopup(
        `${escapeHtml(areaName)}<br>` +
        `色: ${escapeHtml(areaColor)}<br>` +
        `面積: ${formatResultNumber(areaM2)} ㎡<br>` +
        `周囲: ${formatLength(perimeterM)}`
    );

    return {
        name: areaName,
        color: areaColor,
        points: areaPoints,
        markerFlags: areaData.markerFlags.map(flag => flag),
        selectionMode: areaData.selectionMode || 'click',
        lastSelectionMode: areaData.lastSelectionMode || 'click',
        wasDragArea: areaData.wasDragArea || false,
        polygonLayer: polygonLayer,
        featureCollection: cloneGeoJson(fixedFeatureCollection),
        areaM2: areaM2,
        perimeterM: perimeterM
    };
}

function jumpToHistory(index) {
    if (index < 0 || index >= operationTimeline.length) {
        return;
    }

    historyPointer = index;
    restoreSnapshot(operationTimeline[index].snapshot);
    renderOperationHistory();
}

function renderOperationHistory() {
    operationHistoryList.innerHTML = '';

    const visibleEntries = operationTimeline
        .map((entry, index) => ({ entry, index }))
        .filter(item => item.entry.visible);

    if (visibleEntries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = 'まだ操作履歴はありません。';
        operationHistoryList.appendChild(empty);
        return;
    }

    visibleEntries.forEach((item, visibleIndex) => {
        const li = document.createElement('li');
        li.className = 'history-item';

        if (item.index === historyPointer) {
            li.classList.add('current');
        }

        const title = document.createElement('div');
        title.className = 'history-item-title';
        title.textContent = `${visibleIndex + 1}. ${item.entry.label}`;

        const detail = document.createElement('div');
        detail.className = 'history-item-detail';
        detail.textContent = new Date(item.entry.createdAt).toLocaleString('ja-JP');

        const actions = document.createElement('div');
        actions.className = 'history-item-actions';

        const jumpButton = document.createElement('button');
        jumpButton.type = 'button';
        jumpButton.className = 'history-jump-button';
        jumpButton.textContent = item.index === historyPointer ? '現在位置' : 'ここへ戻る';
        jumpButton.disabled = item.index === historyPointer;

        jumpButton.addEventListener('click', function () {
            jumpToHistory(item.index);
        });

        actions.appendChild(jumpButton);
        li.appendChild(title);
        li.appendChild(detail);
        li.appendChild(actions);
        operationHistoryList.appendChild(li);
    });
}

function createLayerSwitcherControl() {
    const LayerSwitcherControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function () {
            const container = L.DomUtil.create('div', 'layer-switcher-control');

            const button = L.DomUtil.create('button', 'layer-switcher-button', container);
            button.type = 'button';
            button.textContent = '地図レイヤ切り替え';

            const panel = L.DomUtil.create('div', 'layer-switcher-panel', container);
            panel.hidden = true;

            Object.keys(baseMapLayers).forEach(layerName => {
                const label = L.DomUtil.create('label', 'layer-switcher-option', panel);

                const radio = L.DomUtil.create('input', '', label);
                radio.type = 'radio';
                radio.name = 'baseMapLayer';
                radio.value = layerName;
                radio.checked = layerName === currentBaseLayerName;

                const text = L.DomUtil.create('span', '', label);
                text.textContent = layerName;

                L.DomEvent.on(radio, 'change', function () {
                    switchBaseLayer(layerName);
                });
            });

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.preventDefault(e);

                panel.hidden = !panel.hidden;
                button.classList.toggle('active', !panel.hidden);
            });

            return container;
        }
    });

    return new LayerSwitcherControl();
}

function switchBaseLayer(layerName) {
    if (layerName === currentBaseLayerName) {
        updateLayerSwitcherRadios();
        return;
    }

    const nextLayer = baseMapLayers[layerName];
    const currentLayer = baseMapLayers[currentBaseLayerName];

    if (!nextLayer) {
        return;
    }

    if (currentLayer && map.hasLayer(currentLayer)) {
        map.removeLayer(currentLayer);
    }

    nextLayer.addTo(map);
    currentBaseLayerName = layerName;
    updateLayerSwitcherRadios();
}

function updateLayerSwitcherRadios() {
    document.querySelectorAll('input[name="baseMapLayer"]').forEach(radio => {
        radio.checked = radio.value === currentBaseLayerName;
    });
}

async function searchAddress() {
    const query = addressInput.value.trim();
    addressCandidateList.innerHTML = '';

    if (query.length === 0) {
        addressSearchMessage.textContent = '住所を入力してください。例：兵庫県神戸市中央区北野町1-1-8';
        return;
    }

    addressSearchButton.disabled = true;
    addressSearchMessage.textContent = '住所を検索しています。';

    try {
        const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('住所検索に失敗しました。');
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            addressSearchMessage.textContent = '候補が見つかりませんでした。都道府県から始まる具体的な住所で入力してください。';
            return;
        }

        const candidates = data
            .filter(feature => {
                return feature &&
                    feature.geometry &&
                    Array.isArray(feature.geometry.coordinates) &&
                    feature.geometry.coordinates.length >= 2 &&
                    feature.properties &&
                    feature.properties.title;
            })
            .slice(0, 8);

        if (candidates.length === 0) {
            addressSearchMessage.textContent = '有効な住所候補が見つかりませんでした。';
            return;
        }

        addressSearchMessage.textContent = 'もしかして次の住所ですか？候補を選ぶと、その場所へ移動します。';

        candidates.forEach((feature, index) => {
            const title = feature.properties.title;
            const coordinates = feature.geometry.coordinates;
            const lng = Number(coordinates[0]);
            const lat = Number(coordinates[1]);

            if (Number.isNaN(lat) || Number.isNaN(lng)) {
                return;
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'candidate-button';
            button.innerHTML =
                `${index + 1}. ${escapeHtml(title)}<br>` +
                `緯度 ${lat.toFixed(6)} / 経度 ${lng.toFixed(6)}`;

            button.addEventListener('click', function () {
                moveToAddressCandidate(title, lat, lng, true);
            });

            addressCandidateList.appendChild(button);
        });
    } catch (error) {
        console.error(error);
        addressSearchMessage.textContent = '住所検索中にエラーが発生しました。少し時間をおいて再度検索してください。';
    } finally {
        addressSearchButton.disabled = false;
    }
}

function moveToAddressCandidate(title, lat, lng, shouldSaveHistory) {
    map.setView([lat, lng], 18);

    if (addressMarker) {
        map.removeLayer(addressMarker);
    }

    addressMarker = L.marker([lat, lng], {
        interactive: false,
        keyboard: false,
        title: title
    }).addTo(map);

    addressSearchMessage.textContent = `「${title}」へ移動しました。`;
    addressCandidateList.innerHTML = '';

    if (shouldSaveHistory) {
        saveAddressHistoryItem(title, lat, lng);
    }

    updateAddressMarkerButton();
}

function saveAddressHistoryItem(title, lat, lng) {
    const newItem = {
        title: title,
        lat: lat,
        lng: lng,
        savedAt: new Date().toISOString()
    };

    addressHistory = addressHistory.filter(item => item.title !== title);
    addressHistory.unshift(newItem);
    addressHistory = addressHistory.slice(0, maxAddressHistoryCount);

    saveAddressHistory();
    renderAddressHistory();
}

function loadAddressHistory() {
    try {
        const json = localStorage.getItem(addressHistoryStorageKey);

        if (!json) {
            addressHistory = [];
            return;
        }

        const parsed = JSON.parse(json);

        if (!Array.isArray(parsed)) {
            addressHistory = [];
            return;
        }

        addressHistory = parsed
            .filter(item => {
                return item &&
                    typeof item.title === 'string' &&
                    typeof item.lat === 'number' &&
                    typeof item.lng === 'number';
            })
            .slice(0, maxAddressHistoryCount);
    } catch (error) {
        console.error(error);
        addressHistory = [];
    }
}

function saveAddressHistory() {
    try {
        localStorage.setItem(addressHistoryStorageKey, JSON.stringify(addressHistory));
    } catch (error) {
        console.error(error);
    }
}

function renderAddressHistory() {
    addressHistoryList.innerHTML = '';
    clearAddressHistoryButton.disabled = addressHistory.length === 0;

    if (addressHistory.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'address-history-empty';
        empty.textContent = 'まだ検索履歴はありません。';
        addressHistoryList.appendChild(empty);
        return;
    }

    addressHistory.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'address-history-button';
        button.innerHTML =
            `${index + 1}. ${escapeHtml(item.title)}<br>` +
            `緯度 ${item.lat.toFixed(6)} / 経度 ${item.lng.toFixed(6)}`;

        button.addEventListener('click', function () {
            addressInput.value = item.title;
            moveToAddressCandidate(item.title, item.lat, item.lng, true);
        });

        addressHistoryList.appendChild(button);
    });
}

function clearAddressHistory() {
    if (addressHistory.length === 0) {
        return;
    }

    if (!window.confirm('住所検索履歴をすべて削除しますか？')) {
        return;
    }

    addressHistory = [];
    saveAddressHistory();
    renderAddressHistory();
    addressSearchMessage.textContent = '住所検索履歴を削除しました。';
}

function clearAddressMarker() {
    if (!addressMarker) {
        return;
    }

    map.removeLayer(addressMarker);
    addressMarker = null;
    addressSearchMessage.textContent = '検索マーカーを消しました。';
    updateAddressMarkerButton();
}

function updateAddressMarkerButton() {
    clearAddressMarkerButton.disabled = addressMarker === null;
}

function clearCurrentLocationMarker() {
    if (!currentLocationMarker) {
        return;
    }

    map.removeLayer(currentLocationMarker);
    currentLocationMarker = null;
    addressSearchMessage.textContent = '現在地マーカーを消しました。';
    updateCurrentLocationMarkerButton();
}

function updateCurrentLocationMarkerButton() {
    clearCurrentLocationMarkerButton.disabled = currentLocationMarker === null;
}

function moveToCurrentLocation(isInitialDisplay, forceRefresh) {
    if (cachedCurrentLocation && !forceRefresh) {
        showCurrentLocationOnMap(
            cachedCurrentLocation.lat,
            cachedCurrentLocation.lng,
            cachedCurrentLocation.accuracy
        );

        addressSearchMessage.textContent = '保存済みの現在地へ移動しました。';
        return;
    }

    if (!navigator.geolocation) {
        if (isInitialDisplay) {
            addressSearchMessage.textContent = 'このブラウザでは現在地取得に対応していないため、皇居付近を表示しています。';
        } else {
            addressSearchMessage.textContent = 'このブラウザでは現在地取得に対応していません。';
        }
        return;
    }

    currentLocationButton.disabled = true;
    addressSearchMessage.textContent = isInitialDisplay ?
        '現在地を取得中です。許可されない場合は皇居付近を表示します。' :
        '現在地を取得中です。';

    navigator.geolocation.getCurrentPosition(
        function (position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            cachedCurrentLocation = {
                lat: lat,
                lng: lng,
                accuracy: accuracy,
                savedAt: Date.now()
            };

            showCurrentLocationOnMap(lat, lng, accuracy);

            addressSearchMessage.textContent = '現在地へ移動しました。';
            currentLocationButton.disabled = false;
        },
        function (error) {
            console.error(error);

            if (isInitialDisplay) {
                map.setView([fallbackLat, fallbackLng], 18);
                addressSearchMessage.textContent = '現在地を取得できなかったため、皇居付近を表示しています。';
            } else {
                addressSearchMessage.textContent = '現在地を取得できませんでした。ブラウザの位置情報許可を確認してください。';
            }

            currentLocationButton.disabled = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5 * 60 * 1000
        }
    );
}

function showCurrentLocationOnMap(lat, lng, accuracy) {
    map.setView([lat, lng], 18);

    if (currentLocationMarker) {
        map.removeLayer(currentLocationMarker);
    }

    currentLocationMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: 'rgb(37, 99, 235)',
        fillColor: 'rgb(96, 165, 250)',
        fillOpacity: 0.9,
        interactive: false
    }).addTo(map);

    updateCurrentLocationMarkerButton();
}

function setSelectionMode(mode) {
    if (isDrawing || isAllConfirmed) {
        return;
    }

    selectionMode = mode;

    if (mode === 'click' || mode === 'draw') {
        lastSelectionMode = mode;
    }

    clickModeButton.classList.toggle('active', selectionMode === 'click');
    drawModeButton.classList.toggle('active', selectionMode === 'draw');

    if (selectionMode === 'click') {
        map.dragging.enable();
        map.doubleClickZoom.enable();
        mapContainer.classList.remove('draw-mode');
        mapContainer.style.cursor = '';
    } else {
        map.dragging.disable();
        map.doubleClickZoom.disable();
        mapContainer.classList.add('draw-mode');
        mapContainer.style.cursor = 'crosshair';
    }

    updateModeOverlay();
}

function updateModeOverlay() {
    if (isAllConfirmed || selectionMode === 'none') {
        modeOverlay.textContent = '現在：エリア確定済み';
        return;
    }

    if (isDrawing) {
        modeOverlay.textContent = '現在：ドラッグ中';
        return;
    }

    if (isDraggingPoint) {
        modeOverlay.textContent = '現在：点を修正中';
        return;
    }

    if (selectionMode === 'click') {
        modeOverlay.textContent = '現在：クリック選択中';
    } else if (selectionMode === 'draw') {
        modeOverlay.textContent = '現在：ドラッグ選択中';
    }
}

function isPointerEventOnLeafletControl(event) {
    return event.target.closest('.leaflet-control') !== null;
}

function isPointerEventOnMarker(event) {
    return event.target.closest('.leaflet-marker-icon') !== null || event.target.closest('.point-marker-icon') !== null;
}

function handleDrawPointerDown(event) {
    if (isAllConfirmed || selectionMode !== 'draw' || isPointerEventOnLeafletControl(event) || isPointerEventOnMarker(event)) {
        return;
    }

    if (event.button !== undefined && event.button !== 0) {
        return;
    }

    deleteFutureHistoryIfNeeded();
    isDrawing = true;
    activeDrawPointerId = event.pointerId;
    currentDragPointCount = 0;

    mapContainer.setPointerCapture(event.pointerId);
    updateModeOverlay();

    const latlng = map.mouseEventToLatLng(event);
    addDragPoint(latlng);
    event.preventDefault();
}

function handleDrawPointerMove(event) {
    if (!isDrawing || activeDrawPointerId !== event.pointerId || selectionMode !== 'draw' || isAllConfirmed) {
        return;
    }

    const latlng = map.mouseEventToLatLng(event);
    const lastPoint = points[points.length - 1];

    if (!lastPoint || map.distance(lastPoint, latlng) >= minDrawDistanceMeters) {
        addDragPoint(latlng);
    }

    event.preventDefault();
}

function handleDrawPointerUp(event) {
    if (!isDrawing || activeDrawPointerId !== event.pointerId) {
        return;
    }

    const latlng = map.mouseEventToLatLng(event);
    const lastPoint = points[points.length - 1];

    if (lastPoint && map.distance(lastPoint, latlng) >= 0.5) {
        addDragPoint(latlng);
    }

    finishPointerDrawing();
    event.preventDefault();
}

function handleDrawPointerCancel(event) {
    if (!isDrawing) {
        return;
    }

    finishPointerDrawing();
}

function finishPointerDrawing() {
    isDrawing = false;
    activeDrawPointerId = null;

    if (currentDragPointCount > 0) {
        recordOperation(`ドラッグで${currentDragPointCount}点追加`);
    }

    currentDragPointCount = 0;
    updateModeOverlay();
    updateButtons();
}

function addClickPoint(latlng) {
    deleteFutureHistoryIfNeeded();

    if (points.length === 0) {
        currentAreaHasDragPoint = false;
    }

    addPoint(latlng, true);
    recordOperation(`点${points.length}を追加`);
}

function addDragPoint(latlng) {
    currentAreaHasDragPoint = true;
    addPoint(latlng, false);
    currentDragPointCount++;
}

function addPoint(latlng, shouldShowMarker) {
    points.push(latlng);

    let marker = null;

    if (shouldShowMarker) {
        marker = createPointMarker(latlng);
    }

    markers.push(marker);

    if (marker) {
        updatePointMarkerPopup(marker);
    }

    clearLastResultValues();
    drawOpenLine();
    updatePointList();
    updateButtons();
}

function createPointMarker(latlng) {
    const marker = L.marker(latlng, {
        icon: pointMarkerIcon,
        draggable: true,
        keyboard: false
    }).addTo(map);

    updatePointMarkerPopup(marker);

    marker.on('dragstart', function () {
        if (isAllConfirmed) {
            return;
        }

        deleteFutureHistoryIfNeeded();
        isDraggingPoint = true;
        clearLastResultValues();
        result.innerHTML = '点を修正しました。必要に応じて「次の範囲を設定」または「エリア確定」を押してください。';
        updateModeOverlay();
        updateButtons();
    });

    marker.on('drag', function () {
        if (isAllConfirmed) {
            return;
        }

        const pointIndex = markers.indexOf(marker);

        if (pointIndex === -1) {
            return;
        }

        const newLatLng = marker.getLatLng();
        points[pointIndex] = L.latLng(newLatLng.lat, newLatLng.lng);

        drawOpenLine();
        updatePointList();
    });

    marker.on('dragend', function () {
        if (isAllConfirmed) {
            return;
        }

        const pointIndex = markers.indexOf(marker);

        if (pointIndex !== -1) {
            const newLatLng = marker.getLatLng();
            points[pointIndex] = L.latLng(newLatLng.lat, newLatLng.lng);
            updatePointMarkerPopup(marker);
            drawOpenLine();
            updatePointList();
            recordOperation(`点${pointIndex + 1}をドラッグ修正`);
        }

        window.setTimeout(function () {
            isDraggingPoint = false;
            updateModeOverlay();
        }, 100);
    });

    return marker;
}

function updatePointMarkerPopup(marker) {
    const pointIndex = markers.indexOf(marker);
    const point = points[pointIndex];

    if (!point || !marker) {
        return;
    }

    marker.options.title = `点${pointIndex + 1}`;
    marker.bindPopup(`点${pointIndex + 1}<br>緯度: ${point.lat.toFixed(6)}<br>経度: ${point.lng.toFixed(6)}`);
}

function refreshAllPointMarkers() {
    markers.forEach(marker => {
        if (marker) {
            updatePointMarkerPopup(marker);
        }
    });
}

function drawOpenLine() {
    if (points.length < 2) {
        if (lineLayer) {
            map.removeLayer(lineLayer);
            lineLayer = null;
        }
        return;
    }

    if (lineLayer) {
        lineLayer.setLatLngs(points);
    } else {
        lineLayer = L.polyline(points, {
            color: 'rgb(37, 99, 235)',
            weight: 4
        }).addTo(map);
    }
}

function updateCurrentPointFromList(index, latInput, lngInput) {
    if (index < 0 || index >= points.length) {
        return;
    }

    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        result.innerHTML = '緯度は-90〜90、経度は-180〜180の範囲で入力してください。';
        return;
    }

    deleteFutureHistoryIfNeeded();
    points[index] = L.latLng(lat, lng);

    if (markers[index]) {
        markers[index].setLatLng(points[index]);
        updatePointMarkerPopup(markers[index]);
    }

    clearLastResultValues();
    drawOpenLine();
    updatePointList();
    updateButtons();
    result.innerHTML = `点${index + 1}を更新しました。`;
    recordOperation(`点${index + 1}を数値更新`);
}

function deleteCurrentPoint(index) {
    if (index < 0 || index >= points.length) {
        return;
    }

    if (!window.confirm(`点${index + 1}を削除しますか？`)) {
        return;
    }

    deleteFutureHistoryIfNeeded();

    const marker = markers[index];

    if (marker) {
        map.removeLayer(marker);
    }

    points.splice(index, 1);
    markers.splice(index, 1);

    refreshAllPointMarkers();
    clearLastResultValues();
    drawOpenLine();
    updatePointList();
    updateButtons();
    result.innerHTML = `点${index + 1}を削除しました。`;
    recordOperation(`点${index + 1}を削除`);
}

function moveToCurrentPoint(index) {
    if (index < 0 || index >= points.length) {
        return;
    }

    map.setView(points[index], Math.max(map.getZoom(), 18));

    if (markers[index]) {
        markers[index].openPopup();
    }
}

function setNextArea() {
    if (points.length < 3) {
        return;
    }

    deleteFutureHistoryIfNeeded();
    clearLastResultValues();

    const fixedArea = createFixedAreaFromCurrentPoints(false);
    fixedAreas.push(fixedArea);

    clearCurrentSelection();

    updateAreaList();
    updatePointList();
    updateButtons();

    result.innerHTML = `範囲${fixedAreas.length}を設定しました。次の範囲を選択できます。`;
    recordOperation(`${getAreaDisplayName(fixedArea, fixedAreas.length - 1)}を設定`);
}

function confirmAllAreas() {
    if (isAllConfirmed) {
        return;
    }

    if (points.length > 0 && points.length < 3) {
        return;
    }

    if (fixedAreas.length === 0 && points.length < 3) {
        return;
    }

    deleteFutureHistoryIfNeeded();

    if (points.length >= 3) {
        const fixedArea = createFixedAreaFromCurrentPoints(true);
        fixedAreas.push(fixedArea);
        clearCurrentSelection();
    }

    if (fixedAreas.length === 0) {
        return;
    }

    isAllConfirmed = true;
    releaseSelectionMode();

    fixedAreas.forEach(area => {
        area.polygonLayer.setStyle(createAreaStyle(area.color, true));
    });

    updateCalculatedTotals();
    showResult(lastAreaM2);
    updateAreaList();
    updatePointList();
    updateButtons();
    updateModeOverlay();
    recordOperation('エリア確定');
}

function createFixedAreaFromCurrentPoints(isFinalArea) {
    const areaPoints = points.map(p => L.latLng(p.lat, p.lng));
    const fixedFeatureCollection = createFeatureCollectionForCurrentArea(areaPoints);
    const areaM2 = calculateFeatureCollectionArea(fixedFeatureCollection);
    const perimeterM = calculateFeatureCollectionPerimeterM(fixedFeatureCollection);
    const areaIndex = fixedAreas.length;
    const areaName = `範囲${areaIndex + 1}`;
    const areaColor = normalizeAreaColor(currentAreaColor || getDefaultAreaColor(areaIndex));

    const polygonLayer = L.geoJSON(fixedFeatureCollection, {
        style: createAreaStyle(areaColor, isFinalArea)
    }).addTo(map);

    polygonLayer.bindPopup(
        `${escapeHtml(areaName)}<br>` +
        `色: ${escapeHtml(areaColor)}<br>` +
        `面積: ${formatResultNumber(areaM2)} ㎡<br>` +
        `周囲: ${formatLength(perimeterM)}`
    );

    return {
        name: areaName,
        color: areaColor,
        points: areaPoints,
        markerFlags: markers.map(marker => marker !== null),
        selectionMode: selectionMode === 'none' ? lastSelectionMode : selectionMode,
        lastSelectionMode: lastSelectionMode,
        wasDragArea: currentAreaHasDragPoint,
        polygonLayer: polygonLayer,
        featureCollection: cloneGeoJson(fixedFeatureCollection),
        areaM2: areaM2,
        perimeterM: perimeterM
    };
}

function createFeatureCollectionForCurrentArea(areaPoints) {
    const rawPolygon = createGeoJsonPolygon(areaPoints);
    return createFixedFeatureCollection(rawPolygon);
}

function createGeoJsonPolygon(latLngPoints) {
    const coordinates = latLngPoints.map(p => [p.lng, p.lat]);
    coordinates.push([latLngPoints[0].lng, latLngPoints[0].lat]);
    return turf.polygon([coordinates]);
}

function createFixedFeatureCollection(rawPolygon) {
    try {
        let featureCollection = turf.featureCollection([rawPolygon]);

        if (typeof turf.unkinkPolygon === 'function') {
            const unkinked = turf.unkinkPolygon(rawPolygon);

            if (unkinked && unkinked.features && unkinked.features.length > 0) {
                featureCollection = unkinked;
            }
        }

        if (typeof turf.union === 'function') {
            const unionedFeature = turf.union(featureCollection);

            if (unionedFeature) {
                return turf.featureCollection([unionedFeature]);
            }
        }

        return featureCollection;
    } catch (error) {
        console.error('自己交差ポリゴンの整理に失敗しました。通常のポリゴンとして処理します。', error);
    }

    return turf.featureCollection([rawPolygon]);
}

function calculateFeatureCollectionArea(featureCollection) {
    let totalArea = 0;

    if (!featureCollection || !featureCollection.features) {
        return 0;
    }

    featureCollection.features.forEach(feature => {
        totalArea += turf.area(feature);
    });

    return totalArea;
}

function calculateFeatureCollectionPerimeterM(featureCollection) {
    if (!featureCollection || !featureCollection.features) {
        return 0;
    }

    let totalPerimeter = 0;

    featureCollection.features.forEach(feature => {
        totalPerimeter += calculateGeoJsonPerimeterM(feature);
    });

    return totalPerimeter;
}

function calculateGeoJsonPerimeterM(geojson) {
    if (!geojson) {
        return 0;
    }

    if (geojson.type === 'FeatureCollection') {
        let total = 0;

        geojson.features.forEach(feature => {
            total += calculateGeoJsonPerimeterM(feature);
        });

        return total;
    }

    if (geojson.type === 'Feature') {
        return calculateGeometryPerimeterM(geojson.geometry);
    }

    return calculateGeometryPerimeterM(geojson);
}

function calculateGeometryPerimeterM(geometry) {
    if (!geometry) {
        return 0;
    }

    if (geometry.type === 'Polygon') {
        return calculatePolygonRingsPerimeterM(geometry.coordinates);
    }

    if (geometry.type === 'MultiPolygon') {
        let total = 0;

        geometry.coordinates.forEach(polygonCoordinates => {
            total += calculatePolygonRingsPerimeterM(polygonCoordinates);
        });

        return total;
    }

    return 0;
}

function calculatePolygonRingsPerimeterM(polygonCoordinates) {
    if (!polygonCoordinates || polygonCoordinates.length === 0) {
        return 0;
    }

    let total = 0;

    polygonCoordinates.forEach(ring => {
        if (!ring || ring.length < 2) {
            return;
        }

        const line = turf.lineString(ring);
        total += turf.length(line, { units: 'kilometers' }) * 1000;
    });

    return total;
}

function createUnionGeoJsonForFixedAreas() {
    const features = [];

    fixedAreas.forEach(area => {
        if (area.featureCollection && Array.isArray(area.featureCollection.features)) {
            area.featureCollection.features.forEach(feature => {
                features.push(cloneGeoJson(feature));
            });
        }
    });

    if (features.length === 0) {
        return null;
    }

    if (features.length === 1) {
        return features[0];
    }

    try {
        const featureCollection = turf.featureCollection(features);
        const unionedFeature = turf.union(featureCollection);

        if (unionedFeature) {
            return unionedFeature;
        }

        return featureCollection;
    } catch (error) {
        console.error('複数範囲の結合に失敗しました。単純合計として処理します。', error);
        return turf.featureCollection(features);
    }
}

function calculateSimpleFixedArea() {
    return fixedAreas.reduce((sum, area) => sum + area.areaM2, 0);
}

function calculateSimpleFixedPerimeter() {
    return fixedAreas.reduce((sum, area) => sum + area.perimeterM, 0);
}

function updateCalculatedTotals() {
    const simpleAreaM2 = calculateSimpleFixedArea();
    const simplePerimeterM = calculateSimpleFixedPerimeter();
    const unionGeoJson = createUnionGeoJsonForFixedAreas();

    let uniqueAreaM2 = simpleAreaM2;
    let uniquePerimeterM = simplePerimeterM;

    if (unionGeoJson) {
        uniqueAreaM2 = turf.area(unionGeoJson);
        uniquePerimeterM = calculateGeoJsonPerimeterM(unionGeoJson);
    }

    const overlapAreaM2 = Math.max(0, simpleAreaM2 - uniqueAreaM2);

    lastAreaM2 = uniqueAreaM2;
    lastSimpleAreaM2 = simpleAreaM2;
    lastOverlapAreaM2 = overlapAreaM2;
    lastTotalPerimeterM = simplePerimeterM;
    lastUniquePerimeterM = uniquePerimeterM;
}

function createAreaStyle(areaColor, isFinalArea) {
    const normalizedColor = normalizeAreaColor(areaColor);

    return {
        color: normalizedColor,
        weight: isFinalArea ? 4 : 3,
        fillColor: normalizedColor,
        fillOpacity: isFinalArea ? 0.30 : 0.22
    };
}

function removeCurrentDrawingLayers() {
    markers.forEach(marker => {
        if (marker) {
            map.removeLayer(marker);
        }
    });

    if (lineLayer) {
        map.removeLayer(lineLayer);
        lineLayer = null;
    }

    fixedAreas.forEach(area => {
        if (area.polygonLayer) {
            map.removeLayer(area.polygonLayer);
        }
    });
}

function clearCurrentSelection() {
    markers.forEach(marker => {
        if (marker) {
            map.removeLayer(marker);
        }
    });

    points.length = 0;
    markers.length = 0;
    currentAreaHasDragPoint = false;
    currentAreaColor = null;

    if (lineLayer) {
        map.removeLayer(lineLayer);
        lineLayer = null;
    }
}

function editFixedArea(index) {
    if (index < 0 || index >= fixedAreas.length) {
        return;
    }

    const targetAreaName = getAreaDisplayName(fixedAreas[index], index);

    if (points.length > 0) {
        const shouldReplaceCurrentPoints = window.confirm(
            '現在編集中の点があります。現在の編集中の点を消して「' + targetAreaName + '」を編集しますか？'
        );

        if (!shouldReplaceCurrentPoints) {
            return;
        }
    }

    if (isAllConfirmed) {
        const shouldReleaseConfirmation = window.confirm(
            'エリア確定済みの結果を解除して「' + targetAreaName + '」を編集しますか？'
        );

        if (!shouldReleaseConfirmation) {
            return;
        }
    }

    deleteFutureHistoryIfNeeded();
    clearLastResultValues();
    isAllConfirmed = false;

    const editingArea = fixedAreas.splice(index, 1)[0];

    if (!editingArea) {
        updateButtons();
        return;
    }

    if (editingArea.polygonLayer) {
        map.removeLayer(editingArea.polygonLayer);
    }

    fixedAreas.forEach(area => {
        if (area.polygonLayer) {
            area.polygonLayer.setStyle(createAreaStyle(area.color, false));
        }
    });

    clearCurrentSelection();
    currentAreaHasDragPoint = editingArea.wasDragArea || false;
    currentAreaColor = normalizeAreaColor(editingArea.color);

    editingArea.points.forEach((p, pointIndex) => {
        const latlng = L.latLng(p.lat, p.lng);
        points.push(latlng);

        if (editingArea.markerFlags[pointIndex]) {
            markers.push(createPointMarker(latlng));
        } else {
            markers.push(null);
        }
    });

    lastSelectionMode = editingArea.lastSelectionMode || 'click';
    setSelectionMode(editingArea.selectionMode || lastSelectionMode);
    refreshAllPointMarkers();
    drawOpenLine();

    result.innerHTML = `「${escapeHtml(targetAreaName)}」を編集状態に戻しました。修正後に「次の範囲を設定」または「エリア確定」を押してください。`;

    updateAreaList();
    updatePointList();
    updateButtons();
    updateModeOverlay();
    recordOperation(`${targetAreaName}を編集状態へ`);
}

function deleteFixedArea(index) {
    if (index < 0 || index >= fixedAreas.length) {
        return;
    }

    const targetAreaName = getAreaDisplayName(fixedAreas[index], index);

    if (!window.confirm(`「${targetAreaName}」を削除しますか？`)) {
        return;
    }

    deleteFutureHistoryIfNeeded();

    const removedArea = fixedAreas.splice(index, 1)[0];

    if (removedArea && removedArea.polygonLayer) {
        map.removeLayer(removedArea.polygonLayer);
    }

    clearLastResultValues();

    if (isAllConfirmed) {
        if (fixedAreas.length === 0) {
            isAllConfirmed = false;
            setSelectionMode(lastSelectionMode);
            result.innerHTML = 'まだ面積は計算されていません。';
        } else {
            updateCalculatedTotals();
            showResult(lastAreaM2);
        }
    } else {
        if (fixedAreas.length === 0 && points.length === 0) {
            result.innerHTML = 'まだ面積は計算されていません。';
        } else if (fixedAreas.length === 0) {
            result.innerHTML = '範囲を削除しました。現在選択中の範囲を編集できます。';
        } else {
            result.innerHTML = `範囲を削除しました。設定済みの範囲が${fixedAreas.length}個あります。`;
        }
    }

    updateFixedAreaPopups();
    updateAreaList();
    updatePointList();
    updateButtons();
    updateModeOverlay();
    recordOperation(`${targetAreaName}を削除`);
}

function undoPoint() {
    if (historyPointer > 0) {
        jumpToHistory(historyPointer - 1);
    }
}

function resetAll() {
    const hasData = points.length > 0 || fixedAreas.length > 0 || isAllConfirmed || lastAreaM2 !== null;

    if (hasData && !window.confirm('選択した点、設定済みの範囲、計算結果、操作履歴をすべてリセットしますか？')) {
        return;
    }

    removeCurrentDrawingLayers();

    points.length = 0;
    markers.length = 0;
    fixedAreas.length = 0;
    clearLastResultValues();
    isAllConfirmed = false;
    isDrawing = false;
    isDraggingPoint = false;
    activeDrawPointerId = null;
    currentDragPointCount = 0;
    currentAreaHasDragPoint = false;
    currentAreaColor = null;

    setSelectionMode(lastSelectionMode);

    updatePointList();
    updateAreaList();
    updateButtons();
    updateModeOverlay();

    result.innerHTML = 'まだ面積は計算されていません。';
    selectionDataMessage.textContent = '選択内容をリセットしました。保存済みのJSONファイルは削除されません。';
    resetOperationTimeline('リセット後');
}

function deleteFutureHistoryIfNeeded() {
    if (historyPointer < operationTimeline.length - 1) {
        operationTimeline.splice(historyPointer + 1);
        renderOperationHistory();
    }
}

function clearLastResultValues() {
    lastAreaM2 = null;
    lastSimpleAreaM2 = null;
    lastOverlapAreaM2 = null;
    lastTotalPerimeterM = null;
    lastUniquePerimeterM = null;
}

function updateButtons() {
    const hasEnoughCurrentPoints = points.length >= 3;
    const hasFixedAreas = fixedAreas.length > 0;
    const hasIncompleteCurrentArea = points.length > 0 && points.length < 3;
    const hasSelectionData = points.length > 0 || fixedAreas.length > 0;

    nextAreaButton.disabled = !hasEnoughCurrentPoints || isAllConfirmed;

    confirmButton.disabled =
        isAllConfirmed ||
        hasIncompleteCurrentArea ||
        (!hasFixedAreas && !hasEnoughCurrentPoints);

    undoButton.disabled = historyPointer <= 0;

    resetButton.disabled =
        points.length === 0 &&
        fixedAreas.length === 0 &&
        !isAllConfirmed &&
        lastAreaM2 === null;

    copyResultButton.disabled = lastAreaM2 === null;
    exportCsvButton.disabled = lastAreaM2 === null;
    saveSelectionDataButton.disabled = !hasSelectionData;

    clickModeButton.disabled = isAllConfirmed;
    drawModeButton.disabled = isAllConfirmed;

    updateComparisonManageButtons();
}

function updatePointList() {
    pointList.innerHTML = '';

    const maxDisplayCount = 80;
    const displayCount = Math.min(points.length, maxDisplayCount);

    for (let i = 0; i < displayCount; i++) {
        const p = points[i];
        const li = document.createElement('li');
        li.className = 'point-item';

        const main = document.createElement('div');
        main.className = 'point-item-main';

        const title = document.createElement('div');
        title.className = 'point-item-title';
        title.textContent = markers[i] ? `点${i + 1}（ドラッグ修正可）` : `点${i + 1}`;

        const detail = document.createElement('div');
        detail.className = 'point-item-detail';
        detail.textContent = `現在値：緯度 ${p.lat.toFixed(6)} / 経度 ${p.lng.toFixed(6)}`;

        const coordinateGrid = document.createElement('div');
        coordinateGrid.className = 'point-coordinate-grid';

        const latInput = document.createElement('input');
        latInput.type = 'number';
        latInput.step = '0.000001';
        latInput.value = p.lat.toFixed(6);
        latInput.setAttribute('aria-label', `点${i + 1}の緯度`);

        const lngInput = document.createElement('input');
        lngInput.type = 'number';
        lngInput.step = '0.000001';
        lngInput.value = p.lng.toFixed(6);
        lngInput.setAttribute('aria-label', `点${i + 1}の経度`);

        coordinateGrid.appendChild(latInput);
        coordinateGrid.appendChild(lngInput);

        const actions = document.createElement('div');
        actions.className = 'point-item-actions';

        const updateButton = document.createElement('button');
        updateButton.type = 'button';
        updateButton.className = 'point-update-button';
        updateButton.textContent = '更新';
        updateButton.disabled = isAllConfirmed;
        updateButton.addEventListener('click', function () {
            updateCurrentPointFromList(i, latInput, lngInput);
        });

        const moveButton = document.createElement('button');
        moveButton.type = 'button';
        moveButton.className = 'point-move-button';
        moveButton.textContent = '地図で表示';
        moveButton.addEventListener('click', function () {
            moveToCurrentPoint(i);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'point-delete-button';
        deleteButton.textContent = '削除';
        deleteButton.disabled = isAllConfirmed;
        deleteButton.addEventListener('click', function () {
            deleteCurrentPoint(i);
        });

        actions.appendChild(updateButton);
        actions.appendChild(moveButton);
        actions.appendChild(deleteButton);

        main.appendChild(title);
        main.appendChild(detail);
        main.appendChild(coordinateGrid);
        main.appendChild(actions);

        li.appendChild(main);
        pointList.appendChild(li);
    }

    if (points.length > maxDisplayCount) {
        const li = document.createElement('li');
        li.className = 'point-item';
        li.textContent = `ほか ${points.length - maxDisplayCount} 点`;
        pointList.appendChild(li);
    }
}

function updateAreaList() {
    updateFixedAreaPopups();
    areaList.innerHTML = '';

    fixedAreas.forEach((area, index) => {
        const li = document.createElement('li');
        li.className = 'area-item';

        const main = document.createElement('div');
        main.className = 'area-item-main';

        const title = document.createElement('div');
        title.className = 'area-item-title';
        title.textContent = isAllConfirmed ? `範囲${index + 1}: 確定済み` : `範囲${index + 1}: 設定済み`;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'area-name-input';
        nameInput.placeholder = `範囲${index + 1}の名前`;
        nameInput.value = area.name || '';

        nameInput.addEventListener('input', function () {
            area.name = nameInput.value;
            updateFixedAreaPopups();
            refreshResultIfNeeded();
        });

        nameInput.addEventListener('change', function () {
            recordOperation(`範囲${index + 1}の名前を変更`);
        });

        const colorRow = document.createElement('div');
        colorRow.className = 'area-color-row';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'area-color-input';
        colorInput.value = normalizeAreaColor(area.color);
        colorInput.setAttribute('aria-label', `範囲${index + 1}の色`);

        const colorText = document.createElement('span');
        colorText.textContent = `範囲色 ${colorInput.value}`;

        colorInput.addEventListener('input', function () {
            area.color = normalizeAreaColor(colorInput.value);
            colorText.textContent = `範囲色 ${area.color}`;

            if (area.polygonLayer) {
                area.polygonLayer.setStyle(createAreaStyle(area.color, isAllConfirmed));
            }

            updateFixedAreaPopups();
        });

        colorInput.addEventListener('change', function () {
            recordOperation(`${getAreaDisplayName(area, index)}の色を変更`);
        });

        colorRow.appendChild(colorInput);
        colorRow.appendChild(colorText);

        const detail = document.createElement('div');
        detail.className = 'area-item-detail';
        detail.textContent =
            `面積 ${formatResultNumber(area.areaM2)} ㎡ / ` +
            `${formatResultNumber(area.areaM2 / 1000000)} ㎢ / ` +
            `${formatResultNumber(area.areaM2 / 10000)} ha / ` +
            `周囲 ${formatLength(area.perimeterM)} / ` +
            `${area.points.length}点`;

        const actions = document.createElement('div');
        actions.className = 'area-item-actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'area-edit-button';
        editButton.textContent = '編集';
        editButton.addEventListener('click', function () {
            editFixedArea(index);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'area-delete-button';
        deleteButton.textContent = '削除';
        deleteButton.addEventListener('click', function () {
            deleteFixedArea(index);
        });

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        main.appendChild(title);
        main.appendChild(nameInput);
        main.appendChild(colorRow);
        main.appendChild(detail);

        li.appendChild(main);
        li.appendChild(actions);
        areaList.appendChild(li);
    });
}

function updateFixedAreaPopups() {
    fixedAreas.forEach((area, index) => {
        if (area.polygonLayer) {
            const areaName = getAreaDisplayName(area, index);

            area.polygonLayer.bindPopup(
                `${escapeHtml(areaName)}<br>` +
                `色: ${escapeHtml(area.color)}<br>` +
                `面積: ${formatResultNumber(area.areaM2)} ㎡<br>` +
                `周囲: ${formatLength(area.perimeterM)}`
            );
        }
    });
}

function getAreaDisplayName(area, index) {
    const name = area && area.name ? area.name.trim() : '';
    return name.length > 0 ? name : `範囲${index + 1}`;
}

function refreshResultIfNeeded() {
    if (lastAreaM2 !== null) {
        showResult(lastAreaM2);
    }
}

function showResult(areaM2) {
    const squareKm = areaM2 / 1000000;
    const tsubo = areaM2 / 3.305785123966942;
    const hectare = areaM2 / 10000;

    const simpleAreaM2 = lastSimpleAreaM2 === null ? areaM2 : lastSimpleAreaM2;
    const overlapAreaM2 = lastOverlapAreaM2 === null ? 0 : lastOverlapAreaM2;
    const totalPerimeterM = lastTotalPerimeterM === null ? 0 : lastTotalPerimeterM;
    const uniquePerimeterM = lastUniquePerimeterM === null ? totalPerimeterM : lastUniquePerimeterM;

    const hasVisibleOverlap = cutDownToSecondDecimal(overlapAreaM2) > 0;
    const hasVisiblePerimeterDifference = cutDownToSecondDecimal(Math.abs(totalPerimeterM - uniquePerimeterM)) > 0;

    const comparison = getComparisonTarget();

    let rangeCountRow = '';

    if (fixedAreas.length >= 2) {
        rangeCountRow = `
                            <tr>
                                <th>範囲数</th>
                                <td>${fixedAreas.length} 個</td>
                            </tr>
                        `;
    }

    let overlapRows = '';

    if (fixedAreas.length >= 2 && hasVisibleOverlap) {
        overlapRows = `
                            <tr>
                                <th>単純合計面積</th>
                                <td>${formatResultNumber(simpleAreaM2)} ㎡</td>
                            </tr>
                            <tr>
                                <th>重なり分</th>
                                <td>${formatResultNumber(overlapAreaM2)} ㎡</td>
                            </tr>
                    `   ;
    }

    let perimeterRows = '';

    if (fixedAreas.length >= 2 && hasVisiblePerimeterDifference) {
        perimeterRows = `
                            <tr>
                                <th>周囲合計（範囲別）</th>
                                <td>${formatLength(totalPerimeterM)}</td>
                            </tr>
                            <tr>
                                <th>周囲（重なり除外後）</th>
                                <td>${formatLength(uniquePerimeterM)}</td>
                            </tr>
                    `   ;
    } else {
        perimeterRows = `
                            <tr>
                                <th>周囲</th>
                                <td>${formatLength(uniquePerimeterM)}</td>
                            </tr>
                    `   ;
    }

    let comparisonRow = '';

    if (comparison.areaM2 > 0) {
        const count = areaM2 / comparison.areaM2;
        comparisonRow = `
                            <tr>
                                <th>${escapeHtml(comparison.name)}換算</th>
                                <td>約 ${formatResultNumber(count)} 個分</td>
                            </tr>
                        `;
    } else {
        comparisonRow = `
                            <tr>
                                <th>比較対象</th>
                                <td>比較対象の面積を正しく入力してください。</td>
                            </tr>
                        `;
    }

    result.innerHTML = `
                        <table>
                            ${rangeCountRow}
                            ${overlapRows}
                            <tr>
                                <th>合計面積（㎡）</th>
                                <td>${formatResultNumber(areaM2)} ㎡</td>
                            </tr>
                            <tr>
                                <th>合計面積（㎢）</th>
                                <td>${formatResultNumber(squareKm)} ㎢</td>
                            </tr>
                            <tr>
                                <th>坪</th>
                                <td>${formatResultNumber(tsubo)} 坪</td>
                            </tr>
                            <tr>
                                <th>ヘクタール</th>
                                <td>${formatResultNumber(hectare)} ha</td>
                            </tr>
                            ${perimeterRows}
                            ${comparisonRow}
                        </table>
                        <div class="accuracy-note">
                            注意：この結果は地図上で選択した点から計算した概算値です。クリック位置、ドラッグの形、地図表示、現在地取得、住所検索の精度によって誤差が出ます。測量・登記・境界確認などの法的用途には使用できません。
                        </div>
                    `;

    updateButtons();
}

function handleComparisonSelectionChanged() {
    const selectedValue = comparisonSelect.value;
    const selectedTarget = getSavedComparisonTargetByValue(selectedValue);

    if (selectedValue === 'custom' || selectedTarget) {
        customAreaBox.style.display = 'block';
        comparisonManager.style.display = 'block';
    } else {
        customAreaBox.style.display = 'none';
        comparisonManager.style.display = 'none';
    }

    if (selectedTarget) {
        customName.value = selectedTarget.name;
        customArea.value = selectedTarget.areaM2;
        comparisonManageMessage.textContent = '保存済みの比較対象を選択中です。編集、更新、削除ができます。';
    } else if (selectedValue === 'custom') {
        comparisonManageMessage.textContent = '名前と面積を入力して、比較対象として保存できます。';
    }

    updateComparisonManageButtons();
    refreshResultIfNeeded();
}

function loadSavedComparisonTargets() {
    try {
        const json = localStorage.getItem(comparisonTargetStorageKey);

        if (!json) {
            savedComparisonTargets = [];
            return;
        }

        const parsed = JSON.parse(json);

        if (!Array.isArray(parsed)) {
            savedComparisonTargets = [];
            return;
        }

        savedComparisonTargets = parsed
            .filter(item => {
                return item &&
                    typeof item.id === 'string' &&
                    typeof item.name === 'string' &&
                    typeof item.areaM2 === 'number' &&
                    item.areaM2 > 0;
            })
            .slice(0, 30);
    } catch (error) {
        console.error(error);
        savedComparisonTargets = [];
    }
}

function saveSavedComparisonTargets() {
    try {
        localStorage.setItem(comparisonTargetStorageKey, JSON.stringify(savedComparisonTargets));
    } catch (error) {
        console.error(error);
        comparisonManageMessage.textContent = '比較対象の保存に失敗しました。ブラウザの保存容量や設定を確認してください。';
    }
}

function renderSavedComparisonOptions() {
    const currentValue = comparisonSelect.value;

    Array.from(comparisonSelect.querySelectorAll('option[data-saved-comparison="true"]')).forEach(option => {
        option.remove();
    });

    const customOption = comparisonSelect.querySelector('option[value="custom"]');

    savedComparisonTargets.forEach(target => {
        const option = document.createElement('option');
        option.value = `saved:${target.id}`;
        option.textContent = `${target.name} ${formatResultNumber(target.areaM2)}㎡`;
        option.dataset.savedComparison = 'true';
        comparisonSelect.insertBefore(option, customOption);
    });

    if (currentValue && Array.from(comparisonSelect.options).some(option => option.value === currentValue)) {
        comparisonSelect.value = currentValue;
    }
}

function getSavedComparisonTargetByValue(value) {
    if (!value || !value.startsWith('saved:')) {
        return null;
    }

    const id = value.replace('saved:', '');
    return savedComparisonTargets.find(target => target.id === id) || null;
}

function createComparisonTargetId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return `target-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function getCustomComparisonInput() {
    const name = customName.value.trim();
    const areaM2 = Number(customArea.value);

    if (name.length === 0) {
        comparisonManageMessage.textContent = '保存する比較対象の名前を入力してください。';
        return null;
    }

    if (!areaM2 || areaM2 <= 0) {
        comparisonManageMessage.textContent = '保存する比較対象の面積を0より大きい数値で入力してください。';
        return null;
    }

    return { name: name, areaM2: areaM2 };
}

function saveCustomComparisonTarget() {
    customAreaBox.style.display = 'block';

    const input = getCustomComparisonInput();

    if (!input) {
        updateComparisonManageButtons();
        return;
    }

    const existingSameName = savedComparisonTargets.find(target => target.name === input.name);

    if (existingSameName) {
        const shouldUpdate = window.confirm(`「${input.name}」はすでに保存されています。面積を更新しますか？`);

        if (!shouldUpdate) {
            return;
        }

        existingSameName.areaM2 = input.areaM2;
        existingSameName.updatedAt = new Date().toISOString();

        saveSavedComparisonTargets();
        renderSavedComparisonOptions();

        comparisonSelect.value = `saved:${existingSameName.id}`;
        handleComparisonSelectionChanged();
        comparisonManageMessage.textContent = `「${input.name}」を更新しました。`;
        return;
    }

    const target = {
        id: createComparisonTargetId(),
        name: input.name,
        areaM2: input.areaM2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    savedComparisonTargets.push(target);
    saveSavedComparisonTargets();
    renderSavedComparisonOptions();

    comparisonSelect.value = `saved:${target.id}`;
    handleComparisonSelectionChanged();
    comparisonManageMessage.textContent = `「${input.name}」を保存しました。`;
}

function updateSelectedComparisonTarget() {
    const selectedTarget = getSavedComparisonTargetByValue(comparisonSelect.value);

    if (!selectedTarget) {
        comparisonManageMessage.textContent = '更新するには、保存済みの比較対象を選んでください。';
        updateComparisonManageButtons();
        return;
    }

    const input = getCustomComparisonInput();

    if (!input) {
        updateComparisonManageButtons();
        return;
    }

    selectedTarget.name = input.name;
    selectedTarget.areaM2 = input.areaM2;
    selectedTarget.updatedAt = new Date().toISOString();

    saveSavedComparisonTargets();
    renderSavedComparisonOptions();

    comparisonSelect.value = `saved:${selectedTarget.id}`;
    handleComparisonSelectionChanged();
    comparisonManageMessage.textContent = `「${input.name}」を更新しました。`;
}

function deleteSelectedComparisonTarget() {
    const selectedTarget = getSavedComparisonTargetByValue(comparisonSelect.value);

    if (!selectedTarget) {
        comparisonManageMessage.textContent = '削除するには、保存済みの比較対象を選んでください。';
        updateComparisonManageButtons();
        return;
    }

    if (!window.confirm(`保存済み比較対象「${selectedTarget.name}」を削除しますか？`)) {
        return;
    }

    savedComparisonTargets = savedComparisonTargets.filter(target => target.id !== selectedTarget.id);

    saveSavedComparisonTargets();
    renderSavedComparisonOptions();

    comparisonSelect.value = 'custom';
    customName.value = selectedTarget.name;
    customArea.value = selectedTarget.areaM2;
    handleComparisonSelectionChanged();
    comparisonManageMessage.textContent = `「${selectedTarget.name}」を削除しました。入力欄には削除前の内容を残しています。`;
}

function updateComparisonManageButtons() {
    const selectedTarget = getSavedComparisonTargetByValue(comparisonSelect.value);
    const inputName = customName.value.trim();
    const inputArea = Number(customArea.value);
    const hasValidInput = inputName.length > 0 && inputArea > 0;

    saveComparisonButton.disabled = !hasValidInput;
    updateComparisonButton.disabled = !selectedTarget || !hasValidInput;
    deleteComparisonButton.disabled = !selectedTarget;
}

function getComparisonTarget() {
    if (comparisonSelect.value === 'custom') {
        const name = customName.value.trim() || '入力した場所';
        const area = Number(customArea.value);

        return { name: name, areaM2: area };
    }

    if (comparisonSelect.value.startsWith('saved:')) {
        const savedTarget = getSavedComparisonTargetByValue(comparisonSelect.value);

        if (savedTarget) {
            return { name: savedTarget.name, areaM2: savedTarget.areaM2 };
        }

        return { name: '保存済み比較対象', areaM2: 0 };
    }

    const selectedOption = comparisonSelect.options[comparisonSelect.selectedIndex];

    return {
        name: selectedOption.text.split(' ')[0],
        areaM2: Number(comparisonSelect.value)
    };
}

async function copyResultToClipboard() {
    if (lastAreaM2 === null) {
        return;
    }

    const copyText = buildResultCopyText();

    try {
        if (!navigator.clipboard || !window.isSecureContext) {
            showManualCopyText(copyText);
            return;
        }

        await navigator.clipboard.writeText(copyText);
        showTemporaryCopyButtonText('コピーしました');
    } catch (error) {
        console.error(error);
        showManualCopyText(copyText);
    }
}

function buildResultCopyText() {
    const areaM2 = lastAreaM2;
    const simpleAreaM2 = lastSimpleAreaM2 === null ? areaM2 : lastSimpleAreaM2;
    const overlapAreaM2 = lastOverlapAreaM2 === null ? 0 : lastOverlapAreaM2;
    const totalPerimeterM = lastTotalPerimeterM === null ? 0 : lastTotalPerimeterM;
    const uniquePerimeterM = lastUniquePerimeterM === null ? totalPerimeterM : lastUniquePerimeterM;

    const hasVisibleOverlap = cutDownToSecondDecimal(overlapAreaM2) > 0;
    const hasVisiblePerimeterDifference = cutDownToSecondDecimal(Math.abs(totalPerimeterM - uniquePerimeterM)) > 0;

    const squareKm = areaM2 / 1000000;
    const tsubo = areaM2 / 3.305785123966942;
    const hectare = areaM2 / 10000;
    const comparison = getComparisonTarget();

    const lines = [];

    lines.push('地図面積計算アプリ 計算結果');
    lines.push(`範囲数：${fixedAreas.length}個`);

    if (fixedAreas.length >= 2 && hasVisibleOverlap) {
        lines.push(`単純合計面積：${formatResultNumber(simpleAreaM2)}㎡`);
        lines.push(`重なり分：${formatResultNumber(overlapAreaM2)}㎡`);
    }

    lines.push(`合計面積（㎡）：${formatResultNumber(areaM2)}㎡`);
    lines.push(`合計面積（㎢）：${formatResultNumber(squareKm)}㎢`);
    lines.push(`坪：${formatResultNumber(tsubo)}坪`);
    lines.push(`ヘクタール：${formatResultNumber(hectare)}ha`);

    if (fixedAreas.length >= 2 && hasVisiblePerimeterDifference) {
        lines.push(`周囲合計（範囲別）：${formatLength(totalPerimeterM)}`);
        lines.push(`周囲（重なり除外後）：${formatLength(uniquePerimeterM)}`);
    } else {
        lines.push(`周囲：${formatLength(uniquePerimeterM)}`);
    }

    if (comparison.areaM2 > 0) {
        const count = areaM2 / comparison.areaM2;
        lines.push(`${comparison.name}換算：約${formatResultNumber(count)}個分`);
    } else {
        lines.push('比較対象：比較対象の面積が未入力または不正です。');
    }

    lines.push('');
    lines.push('注意：この結果は地図上で選択した点から計算した概算値です。測量・登記・境界確認などの法的用途には使用できません。');

    if (fixedAreas.length > 0) {
        lines.push('');
        lines.push('範囲別一覧');

        fixedAreas.forEach((area, index) => {
            const areaName = getAreaDisplayName(area, index);

            lines.push(
                `${index + 1}. ${areaName}：` +
                `色 ${area.color} / ` +
                `${formatResultNumber(area.areaM2)}㎡ / ` +
                `${formatResultNumber(area.areaM2 / 1000000)}㎢ / ` +
                `${formatResultNumber(area.areaM2 / 10000)}ha / ` +
                `周囲 ${formatLength(area.perimeterM)} / ` +
                `${area.points.length}点`
            );
        });
    }

    return lines.join('\n');
}

function showTemporaryCopyButtonText(message) {
    const originalText = copyResultButton.textContent;
    copyResultButton.textContent = message;

    window.setTimeout(function () {
        copyResultButton.textContent = originalText;
    }, 1500);
}

function showManualCopyText(text) {
    window.prompt('自動コピーが使えませんでした。下の内容を Ctrl + C でコピーしてください。', text);
}

function exportResultToCsv() {
    if (lastAreaM2 === null) {
        return;
    }

    const csvText = buildResultCsvText();
    const fileName = `how-large-is-this-area-result-${createDownloadTimestamp()}.csv`;

    downloadTextFile(
        '\uFEFF' + csvText,
        fileName,
        'text/csv;charset=utf-8'
    );

    showTemporaryCsvButtonText('CSVを出力しました');
}

function buildResultCsvText() {
    const comparison = getComparisonTarget();
    const comparisonCount = comparison.areaM2 > 0 ? lastAreaM2 / comparison.areaM2 : '';

    const rows = [
        [
            '区分',
            '番号',
            '名前',
            '色',
            '面積(㎡)',
            '面積(㎢)',
            '坪',
            'ha',
            '周囲(m)',
            '点数',
            '備考'
        ]
    ];

    rows.push([
        '合計',
        '',
        '重なり除外後の合計',
        '',
        toCsvNumber(lastAreaM2),
        toCsvNumber(lastAreaM2 / 1000000),
        toCsvNumber(lastAreaM2 / 3.305785123966942),
        toCsvNumber(lastAreaM2 / 10000),
        toCsvNumber(lastUniquePerimeterM || 0),
        fixedAreas.reduce((sum, area) => sum + area.points.length, 0),
        comparison.areaM2 > 0 ?
            `${comparison.name} 約${formatResultNumber(comparisonCount)}個分` :
            '比較対象の面積が未入力または不正'
    ]);

    if (fixedAreas.length >= 2) {
        rows.push([
            '集計',
            '',
            '単純合計',
            '',
            toCsvNumber(lastSimpleAreaM2 || 0),
            toCsvNumber((lastSimpleAreaM2 || 0) / 1000000),
            toCsvNumber((lastSimpleAreaM2 || 0) / 3.305785123966942),
            toCsvNumber((lastSimpleAreaM2 || 0) / 10000),
            toCsvNumber(lastTotalPerimeterM || 0),
            '',
            '範囲別の単純合計'
        ]);

        rows.push([
            '集計',
            '',
            '重なり分',
            '',
            toCsvNumber(lastOverlapAreaM2 || 0),
            toCsvNumber((lastOverlapAreaM2 || 0) / 1000000),
            toCsvNumber((lastOverlapAreaM2 || 0) / 3.305785123966942),
            toCsvNumber((lastOverlapAreaM2 || 0) / 10000),
            '',
            '',
            '重複していた面積'
        ]);
    }

    fixedAreas.forEach((area, index) => {
        rows.push([
            '範囲',
            index + 1,
            getAreaDisplayName(area, index),
            area.color,
            toCsvNumber(area.areaM2),
            toCsvNumber(area.areaM2 / 1000000),
            toCsvNumber(area.areaM2 / 3.305785123966942),
            toCsvNumber(area.areaM2 / 10000),
            toCsvNumber(area.perimeterM),
            area.points.length,
            area.wasDragArea ? 'ドラッグ選択を含む' : 'クリック選択'
        ]);
    });

    return rows
        .map(row => row.map(escapeCsvValue).join(','))
        .join('\r\n');
}

function toCsvNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '';
    }

    return String(cutDownToSecondDecimal(number));
}

function escapeCsvValue(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function showTemporaryCsvButtonText(message) {
    const originalText = exportCsvButton.textContent;
    exportCsvButton.textContent = message;

    window.setTimeout(function () {
        exportCsvButton.textContent = originalText;
    }, 1500);
}

function saveSelectionDataToFile() {
    if (points.length === 0 && fixedAreas.length === 0) {
        selectionDataMessage.textContent = '保存する点または範囲がありません。';
        return;
    }

    const saveData = createSelectionSaveData();
    const jsonText = JSON.stringify(saveData, null, 2);
    const fileName = `how-large-is-this-area-selection-${createDownloadTimestamp()}.json`;

    downloadTextFile(
        jsonText,
        fileName,
        'application/json;charset=utf-8'
    );

    selectionDataMessage.textContent = '選択データをJSONファイルとして保存しました。';
}

function createSelectionSaveData() {
    const center = map.getCenter();
    const comparison = getComparisonTarget();

    return {
        appName: 'How Large Is This Area',
        dataVersion: selectionDataVersion,
        savedAt: new Date().toISOString(),
        map: {
            center: {
                lat: center.lat,
                lng: center.lng
            },
            zoom: map.getZoom(),
            baseLayerName: currentBaseLayerName
        },
        currentSelection: {
            points: points.map(p => ({ lat: p.lat, lng: p.lng })),
            markerFlags: markers.map(marker => marker !== null),
            selectionMode: selectionMode,
            lastSelectionMode: lastSelectionMode,
            wasDragArea: currentAreaHasDragPoint,
            color: currentAreaColor
        },
        fixedAreas: fixedAreas.map(area => ({
            name: area.name,
            color: area.color,
            points: area.points.map(p => ({ lat: p.lat, lng: p.lng })),
            markerFlags: area.markerFlags.map(flag => flag),
            selectionMode: area.selectionMode,
            lastSelectionMode: area.lastSelectionMode,
            wasDragArea: area.wasDragArea
        })),
        isAllConfirmed: isAllConfirmed,
        comparison: {
            selectedValue: comparisonSelect.value,
            customName: customName.value,
            customArea: customArea.value,
            resolvedName: comparison.name,
            resolvedAreaM2: comparison.areaM2
        }
    };
}

async function handleSelectionDataFileSelected(event) {
    const file = event.target.files && event.target.files[0];

    if (!file) {
        return;
    }

    selectionDataMessage.textContent = '選択データを読み込んでいます。';

    try {
        const text = await readFileAsText(file);
        const data = JSON.parse(text);

        validateSelectionSaveData(data);

        const hasCurrentData = points.length > 0 || fixedAreas.length > 0 || isAllConfirmed;

        if (hasCurrentData && !window.confirm('現在の点、範囲、計算結果、操作履歴を置き換えて選択データを読み込みますか？')) {
            selectionDataMessage.textContent = '読み込みをキャンセルしました。';
            return;
        }

        applySelectionSaveData(data);
        selectionDataMessage.textContent = `「${file.name}」を読み込みました。`;
    } catch (error) {
        console.error(error);
        selectionDataMessage.textContent = `読み込みに失敗しました。${error.message || 'JSONファイルの内容を確認してください。'}`;
    } finally {
        selectionDataFileInput.value = '';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener('load', function () {
            resolve(String(reader.result || ''));
        });

        reader.addEventListener('error', function () {
            reject(new Error('ファイルを読み取れませんでした。'));
        });

        reader.readAsText(file, 'UTF-8');
    });
}

function validateSelectionSaveData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('JSONデータの形式が正しくありません。');
    }

    if (typeof data.dataVersion !== 'number') {
        throw new Error('データのバージョン情報がありません。');
    }

    if (data.dataVersion > selectionDataVersion) {
        throw new Error('このファイルは新しい形式で保存されています。');
    }

    if (!data.currentSelection || !Array.isArray(data.currentSelection.points)) {
        throw new Error('現在選択中の点データがありません。');
    }

    if (!Array.isArray(data.fixedAreas)) {
        throw new Error('設定済み範囲のデータが正しくありません。');
    }

    validateSavedPointArray(data.currentSelection.points, false);

    data.fixedAreas.forEach((area, index) => {
        if (!area || !Array.isArray(area.points)) {
            throw new Error(`範囲${index + 1}の点データが正しくありません。`);
        }

        validateSavedPointArray(area.points, true);
    });
}

function validateSavedPointArray(savedPoints, requireThreePoints) {
    if (requireThreePoints && savedPoints.length < 3) {
        throw new Error('設定済み範囲には3点以上必要です。');
    }

    savedPoints.forEach(point => {
        const lat = Number(point.lat);
        const lng = Number(point.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error('緯度または経度に不正な値があります。');
        }
    });
}

function applySelectionSaveData(data) {
    isRestoringHistory = true;

    removeCurrentDrawingLayers();

    points.length = 0;
    markers.length = 0;
    fixedAreas.length = 0;

    clearLastResultValues();

    isDrawing = false;
    isDraggingPoint = false;
    activeDrawPointerId = null;
    currentDragPointCount = 0;

    const currentSelection = data.currentSelection;

    selectionMode = currentSelection.selectionMode || 'click';
    lastSelectionMode = currentSelection.lastSelectionMode || 'click';
    currentAreaHasDragPoint = currentSelection.wasDragArea || false;
    currentAreaColor = currentSelection.color ? normalizeAreaColor(currentSelection.color) : null;

    const markerFlags = Array.isArray(currentSelection.markerFlags) ?
        currentSelection.markerFlags :
        [];

    currentSelection.points.forEach((p, index) => {
        const latlng = L.latLng(Number(p.lat), Number(p.lng));
        points.push(latlng);

        if (markerFlags[index]) {
            markers.push(createPointMarker(latlng));
        } else {
            markers.push(null);
        }
    });

    data.fixedAreas.forEach((areaData, index) => {
        const areaPoints = areaData.points.map(p => L.latLng(Number(p.lat), Number(p.lng)));
        const featureCollection = createFeatureCollectionForCurrentArea(areaPoints);
        const areaM2 = calculateFeatureCollectionArea(featureCollection);
        const perimeterM = calculateFeatureCollectionPerimeterM(featureCollection);
        const areaColor = normalizeAreaColor(areaData.color || getDefaultAreaColor(index));
        const areaName = typeof areaData.name === 'string' && areaData.name.trim().length > 0 ?
            areaData.name :
            `範囲${index + 1}`;

        const polygonLayer = L.geoJSON(featureCollection, {
            style: createAreaStyle(areaColor, Boolean(data.isAllConfirmed))
        }).addTo(map);

        const savedMarkerFlags = Array.isArray(areaData.markerFlags) ?
            areaData.markerFlags :
            areaPoints.map(() => false);

        fixedAreas.push({
            name: areaName,
            color: areaColor,
            points: areaPoints,
            markerFlags: savedMarkerFlags.map(flag => Boolean(flag)),
            selectionMode: areaData.selectionMode || 'click',
            lastSelectionMode: areaData.lastSelectionMode || 'click',
            wasDragArea: areaData.wasDragArea || false,
            polygonLayer: polygonLayer,
            featureCollection: cloneGeoJson(featureCollection),
            areaM2: areaM2,
            perimeterM: perimeterM
        });
    });

    isAllConfirmed =
        Boolean(data.isAllConfirmed) &&
        fixedAreas.length > 0 &&
        points.length === 0;

    fixedAreas.forEach(area => {
        area.polygonLayer.setStyle(createAreaStyle(area.color, isAllConfirmed));
    });

    restoreComparisonFromSelectionData(data.comparison);

    if (data.map && data.map.baseLayerName && baseMapLayers[data.map.baseLayerName]) {
        switchBaseLayer(data.map.baseLayerName);
    }

    if (
        data.map &&
        data.map.center &&
        Number.isFinite(Number(data.map.center.lat)) &&
        Number.isFinite(Number(data.map.center.lng))
    ) {
        const zoom = Number.isFinite(Number(data.map.zoom)) ?
            Math.min(20, Math.max(2, Number(data.map.zoom))) :
            18;

        map.setView(
            [
                Number(data.map.center.lat),
                Number(data.map.center.lng)
            ],
            zoom
        );
    }

    refreshAllPointMarkers();
    drawOpenLine();

    if (isAllConfirmed) {
        releaseSelectionMode();
        updateCalculatedTotals();
        showResult(lastAreaM2);
    } else {
        setSelectionMode(selectionMode === 'none' ? lastSelectionMode : selectionMode);
        result.innerHTML = '選択データを読み込みました。必要に応じて編集し、「次の範囲を設定」または「エリア確定」を押してください。';
    }

    updateAreaList();
    updatePointList();
    updateButtons();
    updateModeOverlay();

    isRestoringHistory = false;
    resetOperationTimeline('選択データ読み込み直後');
}

function restoreComparisonFromSelectionData(comparisonData) {
    if (!comparisonData || typeof comparisonData !== 'object') {
        handleComparisonSelectionChanged();
        return;
    }

    const selectedValue = String(comparisonData.selectedValue || '');
    const optionExists = Array.from(comparisonSelect.options).some(option => option.value === selectedValue);

    if (optionExists) {
        comparisonSelect.value = selectedValue;

        if (selectedValue === 'custom') {
            customName.value = comparisonData.customName || comparisonData.resolvedName || '';
            customArea.value = comparisonData.customArea || comparisonData.resolvedAreaM2 || '';
        }
    } else {
        comparisonSelect.value = 'custom';
        customName.value = comparisonData.resolvedName || comparisonData.customName || '';
        customArea.value = comparisonData.resolvedAreaM2 || comparisonData.customArea || '';
    }

    handleComparisonSelectionChanged();
}

function downloadTextFile(content, fileName, mimeType) {
    const blob = new Blob([content], {
        type: mimeType
    });

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(function () {
        URL.revokeObjectURL(objectUrl);
    }, 1000);
}

function createDownloadTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hour}${minute}${second}`;
}

function releaseSelectionMode() {
    isDrawing = false;
    isDraggingPoint = false;
    activeDrawPointerId = null;
    currentDragPointCount = 0;
    selectionMode = 'none';

    map.dragging.enable();
    map.doubleClickZoom.enable();
    mapContainer.classList.remove('draw-mode');
    mapContainer.style.cursor = '';

    clickModeButton.classList.remove('active');
    drawModeButton.classList.remove('active');

    updateModeOverlay();
}

function cloneGeoJson(geojson) {
    return JSON.parse(JSON.stringify(geojson));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}