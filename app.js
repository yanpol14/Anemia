/* ==========================================================================
   HEMOEVALUATOR - LÓGICA CLÍNICA OMS, CANVAS Y CONEXIÓN SUPABASE
   ========================================================================== */

// 1. CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://nkxurfvugbcxcpvbtisp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5reHVyZnZ1Z2JjeGNwdmJ0aXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NjQ3NzksImV4cCI6MjEwODA0MDc3OX0.vl6BH2mVibl00GBhGaO-wTbkCL5w-itYxv0YxTHKmbM";

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL !== "https://tu-proyecto.supabase.co") {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 2. TABLAS Y CONSTANTES OMS
const WHO_POPULATION = {
    hombre_adulto: { title: 'Hombre Adulto (≥15 años)', normal: 13.0, severeMax: 7.9, modMin: 8.0, modMax: 10.9 },
    mujer_adulta: { title: 'Mujer Adulta No Embarazada', normal: 12.0, severeMax: 7.9, modMin: 8.0, modMax: 10.9 },
    mujer_embarazada: { title: 'Mujer Embarazada', normal: 11.0, severeMax: 6.9, modMin: 7.0, modMax: 9.9 },
    nino_6_59m: { title: 'Niño / Niña (6-59m)', normal: 11.0, severeMax: 6.9, modMin: 7.0, modMax: 9.9 }
};

let currentStep = 1;
let historyStore = JSON.parse(localStorage.getItem('hemo_patient_history') || '[]');

// 3. FÓRMULA OFICIAL OMS DE CORRECCIÓN POR ALTITUD
function getAltitudeCorrection(meters) {
    if (meters < 1000) return 0;
    if (meters <= 1499) return 0.2;
    if (meters <= 1999) return 0.5;
    if (meters <= 2499) return 0.8;
    if (meters <= 2999) return 1.3;
    if (meters <= 3249) return 1.9;
    if (meters <= 3499) return 2.3; // Huancayo (3,250 m s.n.m.) = -2.3 g/dL
    if (meters <= 3999) return 2.7;
    if (meters <= 4499) return 3.5;
    return 4.5;
}

function setAltitude(m) {
    const input = document.getElementById('altitudInput');
    if (input) {
        input.value = m;
        updateAllCalculations();
    }
}

// 4. SELECCIÓN AUTOMÁTICA DE GRUPO POBLACIONAL
function autoSelectGroup() {
    const edadEl = document.getElementById('edad');
    const unidadEl = document.getElementById('unidadEdad');
    const sexoEl = document.getElementById('sexo');
    const gestanteEl = document.getElementById('gestanteCheck');

    if (!edadEl || !unidadEl || !sexoEl) return;

    const edad = parseFloat(edadEl.value) || 0;
    const unidad = unidadEl.value;
    const sexo = sexoEl.value;
    const esGestante = gestanteEl ? gestanteEl.checked : false;

    let target = 'hombre_adulto';

    if (esGestante && sexo === 'F') {
        target = 'mujer_embarazada';
    } else if (unidad === 'meses' || (unidad === 'años' && edad < 5)) {
        target = 'nino_6_59m';
    } else {
        target = (sexo === 'M') ? 'hombre_adulto' : 'mujer_adulta';
    }

    const radio = document.querySelector(`input[name="poblacion"][value="${target}"]`);
    if (radio) radio.checked = true;
}

// 5. NAVEGACIÓN EN PASOS
function goToStep(step) {
    currentStep = step;
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`step-${i}`);
        const tab = document.getElementById(`tab-step-${i}`);
        if (el) el.style.display = (i === step) ? 'block' : 'none';
        if (tab) tab.className = (i === step) ? 'step-tab active' : (i < step ? 'step-tab completed' : 'step-tab');
    }
    if (step === 4) drawGauge();
}

function validateStep1AndNext() {
    const dni = document.getElementById('dni')?.value.trim();
    const nombres = document.getElementById('nombres')?.value.trim();

    if (!dni || !nombres) {
        alert("Ingrese los datos obligatorios del paciente (DNI y Nombres).");
        return;
    }
    goToStep(2);
}

// 6. CÁLCULO EN TIEMPO REAL
function updateAllCalculations() {
    const popRadio = document.querySelector('input[name="poblacion"]:checked');
    if (!popRadio) return;

    const popVal = popRadio.value;
    const popData = WHO_POPULATION[popVal] || WHO_POPULATION.hombre_adulto;

    const meters = parseFloat(document.getElementById('altitudInput')?.value) || 0;
    const altCorrection = getAltitudeCorrection(meters);

    const altBadge = document.getElementById('altFactorBadge');
    const altText = document.getElementById('altCorrectionText');
    if (altBadge) altBadge.innerText = `+${altCorrection} g/dL`;
    if (altText) altText.innerText = `-${altCorrection} g/dL`;

    const hbObserved = parseFloat(document.getElementById('hbInput')?.value) || 0;
    const hbAdjusted = Math.max(0, Math.round((hbObserved - altCorrection) * 10) / 10);
    const vcm = parseFloat(document.getElementById('vcmInput')?.value) || 80;

    const hbDisp = document.getElementById('hbAdjustedDisplay');
    if (hbDisp) hbDisp.innerText = `${hbAdjusted} g/dL`;

    let severity = 'Sin Anemia';
    let badgeClass = 'badge badge-emerald';
    let diagTitle = 'Sin Anemia Detectada';

    if (hbAdjusted < popData.normal) {
        if (hbAdjusted <= popData.severeMax) {
            severity = 'Anemia Severa';
            badgeClass = 'badge badge-rose';
            diagTitle = 'Anemia Severa';
        } else if (hbAdjusted >= popData.modMin && hbAdjusted <= popData.modMax) {
            severity = 'Anemia Moderada';
            badgeClass = 'badge badge-amber';
            diagTitle = 'Anemia Moderada';
        } else {
            severity = 'Anemia Leve';
            badgeClass = 'badge badge-cyan';
            diagTitle = 'Anemia Leve';
        }
    }

    const sevBadge = document.getElementById('resSeverityBadge');
    if (sevBadge) {
        sevBadge.innerText = severity;
        sevBadge.className = badgeClass;
    }

    const titleEl = document.getElementById('resDiagnosisTitle');
    if (titleEl) titleEl.innerText = diagTitle;

    const hbCorrEl = document.getElementById('resHbCorr');
    if (hbCorrEl) hbCorrEl.innerText = `${hbAdjusted} g/dL`;

    // Datos para reporte impreso
    const dniEl = document.getElementById('prtDni');
    const nomEl = document.getElementById('prtNombre');
    const diagEl = document.getElementById('prtDiag');
    if (dniEl) dniEl.innerText = document.getElementById('dni')?.value || '--';
    if (nomEl) nomEl.innerText = document.getElementById('nombres')?.value || '--';
    if (diagEl) diagEl.innerText = diagTitle;

    if (currentStep === 4) drawGauge();
}

// 7. RENDERIZADO DE GAUGE CANVAS
function drawGauge() {
    const canvas = document.getElementById('gaugeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const meters = parseFloat(document.getElementById('altitudInput')?.value) || 0;
    const altCorrection = getAltitudeCorrection(meters);
    const hbObserved = parseFloat(document.getElementById('hbInput')?.value) || 0;
    const hbAdjusted = Math.max(0, Math.round((hbObserved - altCorrection) * 10) / 10);

    const centerX = width / 2;
    const centerY = height - 20;
    const radius = 100;

    function hbToAngle(hb) {
        const min = 5, max = 17;
        const pct = (Math.max(min, Math.min(max, hb)) - min) / (max - min);
        return Math.PI + pct * Math.PI;
    }

    // Dibujar Arcos
    drawArc(ctx, centerX, centerY, radius, hbToAngle(5), hbToAngle(8), '#ef4444');
    drawArc(ctx, centerX, centerY, radius, hbToAngle(8), hbToAngle(11), '#f59e0b');
    drawArc(ctx, centerX, centerY, radius, hbToAngle(11), hbToAngle(13), '#06b6d4');
    drawArc(ctx, centerX, centerY, radius, hbToAngle(13), hbToAngle(17), '#10b981');

    // Aguja
    const angle = hbToAngle(hbAdjusted);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle - Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(0, -radius + 10);
    ctx.lineTo(4, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
}

function drawArc(ctx, x, y, radius, start, end, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, start, end);
    ctx.lineWidth = 16;
    ctx.strokeStyle = color;
    ctx.stroke();
}

// 8. GUARDAR Y SINCRONIZAR CON SUPABASE & LOCALSTORAGE
async function saveReportToHistory() {
    const dni = document.getElementById('dni')?.value.trim();
    const nombres = document.getElementById('nombres')?.value.trim();
    const appPaterno = document.getElementById('appPaterno')?.value.trim() || '';

    if (!dni || !nombres) {
        alert("Por favor ingrese el DNI y Nombre del paciente.");
        return;
    }

    const meters = parseFloat(document.getElementById('altitudInput')?.value) || 0;
    const altCorrection = getAltitudeCorrection(meters);
    const hbObserved = parseFloat(document.getElementById('hbInput')?.value) || 0;
    const hbAdjusted = Math.max(0, Math.round((hbObserved - altCorrection) * 10) / 10);

    const record = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString('es-PE'),
        dni: dni,
        nombreCompleto: `${nombres} ${appPaterno}`.trim(),
        edadSexo: `${document.getElementById('edad')?.value} / ${document.getElementById('sexo')?.value}`,
        altitud: meters,
        hbObserved: hbObserved,
        hbAdjusted: hbAdjusted,
        severity: document.getElementById('resSeverityBadge')?.innerText || 'Sin Anemia'
    };

    // Guardar en LocalStorage
    historyStore.unshift(record);
    localStorage.setItem('hemo_patient_history', JSON.stringify(historyStore));

    // Intentar guardar en Supabase si está configurado
    if (supabaseClient) {
        try {
            await supabaseClient.from('pacientes_anemia').insert([record]);
            console.log("Sincronizado con Supabase.");
        } catch (err) {
            console.warn("No se pudo sincronizar con Supabase, guardado en LocalStorage.", err);
        }
    }

    alert(`✅ Evaluación de ${record.nombreCompleto} (DNI: ${dni}) guardada con éxito.`);
    window.location.href = "historial.html";
}

// 9. RENDERIZAR TABLA DE HISTORIAL
function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    const search = document.getElementById('searchDniInput')?.value.toLowerCase().trim() || '';
    const filterSev = document.getElementById('filterSeveritySelect')?.value || 'ALL';
    const noMsg = document.getElementById('noHistoryMsg');

    tbody.innerHTML = '';

    const filtered = historyStore.filter(item => {
        const matchSearch = item.dni.toLowerCase().includes(search) || item.nombreCompleto.toLowerCase().includes(search);
        const matchSev = (filterSev === 'ALL') || (item.severity === filterSev);
        return matchSearch && matchSev;
    });

    if (filtered.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        return;
    }
    if (noMsg) noMsg.style.display = 'none';

    filtered.forEach(item => {
        const tr = document.createElement('tr');
        
        let badgeClass = 'badge badge-emerald';
        const sevLower = (item.severity || '').toLowerCase();

        if (sevLower.includes('severa')) {
            badgeClass = 'badge badge-rose';
        } else if (sevLower.includes('moderada')) {
            badgeClass = 'badge badge-amber';
        } else if (sevLower.includes('leve')) {
            badgeClass = 'badge badge-cyan';
        }

        tr.innerHTML = `
            <td style="color:var(--text-muted);">${item.fecha}</td>
            <td style="font-weight:700; color:var(--cyan); font-family:monospace;">${item.dni}</td>
            <td style="font-weight:600;">${item.nombreCompleto}</td>
            <td>${item.edadSexo}</td>
            <td>${item.altitud} m</td>
            <td style="font-weight:800; color:var(--rose);">${item.hbAdjusted} g/dL</td>
            <td><span class="${badgeClass}">${item.severity}</span></td>
            <td style="text-align:center;">
                <button class="btn btn-danger btn-sm" onclick="deleteRecord(${item.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteRecord(id) {
    if (confirm("¿Desea eliminar este registro?")) {
        historyStore = historyStore.filter(i => i.id !== id);
        localStorage.setItem('hemo_patient_history', JSON.stringify(historyStore));
        renderHistoryTable();
    }
}

function clearAllHistory() {
    if (confirm("¿Borrar todo el historial guardado?")) {
        historyStore = [];
        localStorage.setItem('hemo_patient_history', JSON.stringify(historyStore));
        renderHistoryTable();
    }
}

// Inicialización al cargar la página
window.onload = function() {
    autoSelectGroup();
    updateAllCalculations();
};
