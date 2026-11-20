// © 2026 RuChating (iilmchat) · VoltWireCraft v0.4.0
import type { GraphNode, ProjectGraph } from '@voltwirecraft/shared/graph.schema.js';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useI18n } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/index.js';
import {
    DIN_MODULE_WIDTH_MM,
    RAIL_MODULES,
    moduleWidthModules,
    phaseColor,
    phaseForSlot,
    ratingLabel,
} from '../lib/panelModules.js';
import { useEditorStore } from '../store/editorStore.js';

/** Масштаб сцены: 1 единица Three.js соответствует 10 мм (RULES § 5.3). */
const UNITS_PER_MM = 0.1;

/** Ширина одного DIN-модуля в единицах сцены. */
const MODULE_UNIT_WIDTH = DIN_MODULE_WIDTH_MM * UNITS_PER_MM;

/** Ширина DIN-рейки (18 модулей) в единицах сцены. */
const RAIL_WIDTH = RAIL_MODULES * MODULE_UNIT_WIDTH;

/** Высота модуля, мм. */
const MODULE_HEIGHT_MM = 90;

/** Высота модуля в единицах сцены. */
const MODULE_HEIGHT = MODULE_HEIGHT_MM * UNITS_PER_MM;

/** Глубина модуля в единицах сцены. */
const MODULE_DEPTH = 7;

/** Шаг между рядами DIN-реек в единицах сцены. */
const ROW_STEP = 14;

/** Глубина корпуса НКУ в единицах сцены. */
const ENCLOSURE_DEPTH = 12;

/** Толщина стенок корпуса в единицах сцены. */
const WALL_THICKNESS = 0.5;

/** Верхний отступ от крышки до первого ряда, единицы сцены. */
const TOP_MARGIN = 4;

/** Высота зоны нулевых и защитных шин внизу корпуса. */
const BUS_AREA_HEIGHT = 8;

/** Нижний отступ корпуса. */
const BOTTOM_MARGIN = 3;

/** Боковой запас корпуса относительно рейки. */
const SIDE_MARGIN = 4;

/** Минимальное число рядов, отрисовываемых даже при пустом графе. */
const MIN_RAILS = 2;

/** Порог смещения указателя (пиксели), ниже которого считаем жест кликом. */
const CLICK_MOVE_THRESHOLD_SQ = 25;

/** Цвет подсветки выбранного модуля. */
const SELECTED_COLOR = 0x0ea5e9;

/** Цвет подсветки модуля при наведении. */
const HOVER_COLOR = 0xfacc15;

/** Тип материала корпуса НКУ. */
type EnclosureMaterialKind = 'metal' | 'plastic';

/** Узел графа с гарантированно назначенным слотом щита. */
type SlottedNode = GraphNode & { panelSlot: number };

/** Модуль, размещённый на трёхмерной DIN-рейке. */
interface Placed3DModule {
    /** Узел канонического графа. */
    node: SlottedNode;
    /** Номер позиции внутри ряда (начиная с нуля). */
    slotWithinRail: number;
    /** Номер ряда DIN-рейки (начиная с нуля). */
    railIndex: number;
    /** Занимаемая ширина в DIN-модулях. */
    widthModules: number;
}

/** Состояние императивно созданной сцены Three.js. */
interface SceneContext {
    /** Корневая сцена. */
    scene: THREE.Scene;
    /** Перспективная камера. */
    camera: THREE.PerspectiveCamera;
    /** WebGL-рендерер. */
    renderer: THREE.WebGLRenderer;
    /** Управление орбитой/зумом. */
    controls: OrbitControls;
    /** Динамическая группа с содержимым щита (пересоздаётся при изменении графа). */
    content: THREE.Group;
    /** Сетка-пол. */
    grid: THREE.GridHelper;
    /** Луч для выбора модулей. */
    raycaster: THREE.Raycaster;
    /** Нормализованные координаты указателя. */
    pointer: THREE.Vector2;
    /** Кликабельные меши корпусов модулей. */
    moduleMeshes: THREE.Mesh[];
    /** Модуль под курсором. */
    hovered: THREE.Mesh | null;
    /** Идентификатор выбранного узла из хранилища. */
    selectedNodeId: string | null;
    /** Рекомендованное расстояние камеры для текущего корпуса. */
    viewDistance: number;
    /** Была ли уже установлена начальная позиция камеры. */
    viewInitialized: boolean;
    /** Идентификатор кадра анимации. */
    frameId: number;
    /** Точка нажатия для отличия клика от вращения. */
    downPoint: { x: number; y: number } | null;
}

/**
 * Разложить модули щита по рядам так же, как в `PanelLayoutEditor`.
 *
 * @param nodes Узлы графа с назначенным слотом щита.
 * @returns Размещённые модули и число задействованных рядов.
 */
function layoutModules3D(nodes: readonly SlottedNode[]): { modules: Placed3DModule[]; railCount: number } {
    const modules: Placed3DModule[] = [];
    let railIndex = 0;
    let slotWithinRail = 0;

    for (const node of nodes) {
        const widthModules = moduleWidthModules(node);
        if (slotWithinRail + widthModules > RAIL_MODULES) {
            railIndex += 1;
            slotWithinRail = 0;
        }
        modules.push({ node, slotWithinRail, railIndex, widthModules });
        slotWithinRail += widthModules;
    }

    return { modules, railCount: modules.length === 0 ? 0 : railIndex + 1 };
}

/**
 * Угол наклона рукоятки взведения в зависимости от типа аппарата.
 *
 * @param kind Тип УГО узла графа.
 * @returns Угол в радианах; 0, если рукоятка не изображается.
 */
function leverTilt(kind: GraphNode['kind']): number {
    if (kind === 'circuit_breaker') {
        return 0.45;
    }
    if (kind === 'rcd') {
        return -0.32;
    }
    if (kind === 'rcbo') {
        return 0.28;
    }
    return 0;
}

/**
 * Освободить геометрию, материалы и текстуры объекта сцены.
 * Спрайты обрабатываются отдельно: их геометрия является общей для всех спрайтов three.js.
 *
 * @param root Корень поддерева, подлежащего очистке.
 */
function disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => {
        if (object instanceof THREE.Sprite) {
            const spriteMaterial = object.material;
            if (spriteMaterial.map !== null) {
                spriteMaterial.map.dispose();
            }
            spriteMaterial.dispose();
            return;
        }
        const renderable = object as THREE.Object3D & {
            geometry?: THREE.BufferGeometry;
            material?: THREE.Material | THREE.Material[];
        };
        renderable.geometry?.dispose();
        const material = renderable.material;
        if (Array.isArray(material)) {
            for (const item of material) {
                item.dispose();
            }
        } else if (material !== undefined) {
            material.dispose();
        }
    });
}

/**
 * Создать подпись модуля как спрайт с текстурой из canvas (без внешних шрифтов).
 *
 * @param label Подпись узла из графа.
 * @param rating Номинал из `ratingLabel`.
 * @param phase Цвет фазы в формате `#rrggbb`.
 * @returns Спрайт с двухстрочной подписью.
 */
function makeLabelSprite(label: string, rating: string, phase: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (context !== null) {
        context.fillStyle = 'rgba(15, 23, 42, 0.92)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = phase;
        context.lineWidth = 6;
        context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        context.textAlign = 'center';
        context.fillStyle = '#f8fafc';
        context.font = 'bold 40px sans-serif';
        context.fillText(label, canvas.width / 2, 52, canvas.width - 24);
        context.fillStyle = '#cbd5e1';
        context.font = '30px sans-serif';
        context.fillText(rating, canvas.width / 2, 96, canvas.width - 24);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
    });
    return new THREE.Sprite(material);
}

/**
 * Обновить подсветку корпусов модулей по состоянию выбора и наведения.
 *
 * @param context Активная сцена Three.js.
 */
function updateHighlights(context: SceneContext): void {
    for (const mesh of context.moduleMeshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const nodeId = mesh.userData['nodeId'];
        const isSelected = typeof nodeId === 'string' && nodeId === context.selectedNodeId;
        const isHovered = mesh === context.hovered;
        if (isSelected) {
            material.emissive.setHex(SELECTED_COLOR);
            material.emissiveIntensity = 0.75;
        } else if (isHovered) {
            material.emissive.setHex(HOVER_COLOR);
            material.emissiveIntensity = 0.5;
        } else {
            material.emissive.setHex(0x000000);
            material.emissiveIntensity = 0;
        }
    }
}

/**
 * Установить камеру в один из предустановленных ракурсов.
 *
 * @param context Активная сцена Three.js.
 * @param mode `'front'` — вид строго спереди, `'reset'` — изометрия по умолчанию.
 */
function setCameraView(context: SceneContext, mode: 'front' | 'reset'): void {
    const distance = context.viewDistance;
    if (mode === 'front') {
        context.camera.position.set(0, 0, distance);
    } else {
        context.camera.position.set(distance * 0.65, distance * 0.45, distance * 0.8);
    }
    context.controls.target.set(0, 0, 0);
    context.controls.update();
}

/**
 * Пересобрать содержимое щита из канонического графа.
 * Рендерер, камера и контролы остаются живыми — заменяется только группа `content`.
 *
 * @param context Активная сцена Three.js.
 * @param graph Канонический граф проекта (RULES § 5.2).
 * @param materialKind Материал корпуса (металл/пластик).
 * @param selectedNodeId Идентификатор выбранного узла для подсветки.
 */
function rebuildContent(
    context: SceneContext,
    graph: ProjectGraph,
    materialKind: EnclosureMaterialKind,
    selectedNodeId: string | null,
): void {
    for (const child of [...context.content.children]) {
        context.content.remove(child);
        disposeObject(child);
    }
    context.moduleMeshes = [];
    context.hovered = null;
    context.selectedNodeId = selectedNodeId;

    const panelNodes = graph.nodes
        .filter((node): node is SlottedNode => node.panelSlot !== null)
        .sort((a, b) => a.panelSlot - b.panelSlot);
    const { modules, railCount } = layoutModules3D(panelNodes);
    const rails = Math.max(railCount, MIN_RAILS);

    const enclosureWidth = RAIL_WIDTH + 2 * SIDE_MARGIN;
    const enclosureHeight = TOP_MARGIN + rails * ROW_STEP + BUS_AREA_HEIGHT + BOTTOM_MARGIN;
    const halfWidth = enclosureWidth / 2;
    const halfHeight = enclosureHeight / 2;
    const halfDepth = ENCLOSURE_DEPTH / 2;

    const shellMaterial = materialKind === 'metal'
        ? new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.35 })
        : new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.05, roughness: 0.75 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.3 });
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const leverMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.2, roughness: 0.5 });

    const addBox = (
        width: number,
        height: number,
        depth: number,
        x: number,
        y: number,
        z: number,
        material: THREE.Material,
    ): THREE.Mesh => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        context.content.add(mesh);
        return mesh;
    };

    // Задняя стенка и боковины корпуса.
    addBox(enclosureWidth, enclosureHeight, WALL_THICKNESS, 0, 0, -halfDepth + WALL_THICKNESS / 2, shellMaterial);
    addBox(WALL_THICKNESS, enclosureHeight, ENCLOSURE_DEPTH, -halfWidth + WALL_THICKNESS / 2, 0, 0, shellMaterial);
    addBox(WALL_THICKNESS, enclosureHeight, ENCLOSURE_DEPTH, halfWidth - WALL_THICKNESS / 2, 0, 0, shellMaterial);
    addBox(enclosureWidth, WALL_THICKNESS, ENCLOSURE_DEPTH, 0, halfHeight - WALL_THICKNESS / 2, 0, shellMaterial);
    addBox(enclosureWidth, WALL_THICKNESS, ENCLOSURE_DEPTH, 0, -halfHeight + WALL_THICKNESS / 2, 0, shellMaterial);

    // Прозрачная дверца и её рамка.
    const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(enclosureWidth - 2 * WALL_THICKNESS, enclosureHeight - 2 * WALL_THICKNESS),
        doorMaterial,
    );
    glass.position.set(0, 0, halfDepth - 0.15);
    context.content.add(glass);
    const frameDepth = 0.6;
    addBox(enclosureWidth, 0.5, frameDepth, 0, halfHeight - 0.25, halfDepth, shellMaterial);
    addBox(enclosureWidth, 0.5, frameDepth, 0, -halfHeight + 0.25, halfDepth, shellMaterial);
    addBox(0.5, enclosureHeight, frameDepth, -halfWidth + 0.25, 0, halfDepth, shellMaterial);
    addBox(0.5, enclosureHeight, frameDepth, halfWidth - 0.25, 0, halfDepth, shellMaterial);

    // DIN-рейки: по одной на каждый ряд.
    const railZ = -halfDepth + 2.6;
    const firstRowY = halfHeight - TOP_MARGIN - MODULE_HEIGHT / 2;
    const rowY = (railIndex: number): number => firstRowY - railIndex * ROW_STEP;
    for (let index = 0; index < rails; index += 1) {
        addBox(RAIL_WIDTH, 0.6, 1.4, 0, rowY(index) - MODULE_HEIGHT / 2 - 0.3, railZ, railMaterial);
    }

    // Модули графа.
    for (const placed of modules) {
        const phase = phaseForSlot(placed.node.panelSlot);
        const color = phaseColor(phase);
        const centerX = -RAIL_WIDTH / 2 + (placed.slotWithinRail + placed.widthModules / 2) * MODULE_UNIT_WIDTH;
        const centerY = rowY(placed.railIndex);
        const centerZ = railZ + MODULE_DEPTH / 2 + 0.7;
        const width = placed.widthModules * MODULE_UNIT_WIDTH - 0.15;

        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            metalness: 0.1,
            roughness: 0.6,
            emissive: 0x000000,
            emissiveIntensity: 0,
        });
        const body = addBox(width, MODULE_HEIGHT, MODULE_DEPTH, centerX, centerY, centerZ, bodyMaterial);
        body.userData['nodeId'] = placed.node.id;
        context.moduleMeshes.push(body);

        // Цветная полоса фазы сверху корпуса модуля.
        const bandMaterial = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.7,
            metalness: 0.1,
            roughness: 0.4,
        });
        addBox(width, 0.9, MODULE_DEPTH + 0.06, centerX, centerY + MODULE_HEIGHT / 2 - 0.45, centerZ, bandMaterial);

        // Рукоятка взведения для автоматов и УЗО/АВДТ.
        const tilt = leverTilt(placed.node.kind);
        if (tilt !== 0) {
            const lever = addBox(
                0.55,
                1.8,
                0.5,
                centerX,
                centerY + 1.0,
                centerZ + MODULE_DEPTH / 2 + 0.25,
                leverMaterial,
            );
            lever.rotation.x = tilt;
        }

        // Подпись «QF1/QD1» и номинал — из доменных данных графа.
        const sprite = makeLabelSprite(placed.node.label, ratingLabel(placed.node), color);
        sprite.position.set(centerX, centerY + 1.2, centerZ + MODULE_DEPTH / 2 + 0.5);
        sprite.scale.set(Math.min(width * 0.9, 2.4), 1.2, 1);
        context.content.add(sprite);
    }

    // Нулевая (N) и защитная (PE) шины под рейками.
    const busY = -halfHeight + BOTTOM_MARGIN + BUS_AREA_HEIGHT - 1.5;
    const busNMaterial = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        metalness: 0.7,
        roughness: 0.3,
    });
    const busPeMaterial = new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        metalness: 0.6,
        roughness: 0.35,
    });
    const busStripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.2,
        roughness: 0.5,
    });
    addBox(RAIL_WIDTH, 0.9, 1.0, 0, busY, railZ, busNMaterial);
    addBox(RAIL_WIDTH, 0.9, 1.0, 0, busY - 2.5, railZ, busPeMaterial);
    addBox(RAIL_WIDTH, 0.22, 1.05, 0, busY - 2.15, railZ, busStripeMaterial);

    // Пол и расстояние камеры пересчитываются под фактический размер корпуса.
    context.grid.position.y = -halfHeight - 6;
    context.viewDistance = Math.max(enclosureWidth, enclosureHeight) * 1.6;
    if (!context.viewInitialized) {
        context.viewInitialized = true;
        setCameraView(context, 'reset');
    }

    updateHighlights(context);
}

/**
 * Трёхмерный интерактивный вид сборки НКУ, построенный из канонического графа.
 * Содержимое щита пересобирается при изменении графа или материала корпуса,
 * а рендерер, камера и OrbitControls живут на протяжении всего времени жизни компонента.
 *
 * @returns React-элемент секции с WebGL-полотном и панелью управления.
 */
export function Panel3DView() {
    const { t } = useI18n();
    const graph = useEditorStore((state) => state.graph);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const contextRef = useRef<SceneContext | null>(null);
    const selectedRef = useRef<string | null>(selectedNodeId);
    const [materialKind, setMaterialKind] = useState<EnclosureMaterialKind>('metal');

    // Актуальный выбор нужен при пересборке сцены из эффекта, зависящего только от графа.
    selectedRef.current = selectedNodeId;

    useEffect(() => {
        const container = containerRef.current;
        if (container === null) {
            return;
        }

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1120);

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
        camera.position.set(60, 40, 80);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const canvas = renderer.domElement;
        canvas.style.display = 'block';
        container.appendChild(canvas);

        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        controls.minDistance = 12;
        controls.maxDistance = 600;

        const ambient = new THREE.AmbientLight(0xffffff, 1.5);
        scene.add(ambient);
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(30, 60, 80);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
        fillLight.position.set(-40, 20, 40);
        scene.add(fillLight);

        const grid = new THREE.GridHelper(200, 40, 0x1e3a5f, 0x172033);
        grid.position.y = -40;
        scene.add(grid);

        const content = new THREE.Group();
        scene.add(content);

        const context: SceneContext = {
            scene,
            camera,
            renderer,
            controls,
            content,
            grid,
            raycaster: new THREE.Raycaster(),
            pointer: new THREE.Vector2(),
            moduleMeshes: [],
            hovered: null,
            selectedNodeId: useEditorStore.getState().selectedNodeId,
            viewDistance: 90,
            viewInitialized: false,
            frameId: 0,
            downPoint: null,
        };
        contextRef.current = context;

        const resize = (): void => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width === 0 || height === 0) {
                return;
            }
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            // Обновляем и размер буфера, и CSS-размер полотна (иначе холст не изменится визуально).
            renderer.setSize(width, height);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        const updatePointer = (event: PointerEvent): void => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                return;
            }
            context.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            context.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        };

        const pickModule = (): THREE.Mesh | null => {
            context.raycaster.setFromCamera(context.pointer, context.camera);
            const hits = context.raycaster.intersectObjects(context.moduleMeshes, false);
            const first = hits[0];
            return first === undefined ? null : (first.object as THREE.Mesh);
        };

        const onPointerMove = (event: PointerEvent): void => {
            updatePointer(event);
            const hit = pickModule();
            if (hit !== context.hovered) {
                context.hovered = hit;
                canvas.style.cursor = hit === null ? 'grab' : 'pointer';
                updateHighlights(context);
            }
        };

        const onPointerLeave = (): void => {
            if (context.hovered !== null) {
                context.hovered = null;
                canvas.style.cursor = 'grab';
                updateHighlights(context);
            }
            context.downPoint = null;
        };

        const onPointerDown = (event: PointerEvent): void => {
            context.downPoint = { x: event.clientX, y: event.clientY };
        };

        const onPointerUp = (event: PointerEvent): void => {
            const down = context.downPoint;
            context.downPoint = null;
            if (down === null) {
                return;
            }
            const dx = event.clientX - down.x;
            const dy = event.clientY - down.y;
            if (dx * dx + dy * dy > CLICK_MOVE_THRESHOLD_SQ) {
                return;
            }
            updatePointer(event);
            const hit = pickModule();
            if (hit === null) {
                return;
            }
            const nodeId = hit.userData['nodeId'];
            if (typeof nodeId === 'string') {
                useEditorStore.getState().selectNode(nodeId);
            }
        };

        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerleave', onPointerLeave);
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);

        const animate = (): void => {
            context.frameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(context.frameId);
            observer.disconnect();
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            controls.dispose();
            disposeObject(content);
            disposeObject(grid);
            scene.clear();
            renderer.dispose();
            if (canvas.parentNode === container) {
                container.removeChild(canvas);
            }
            contextRef.current = null;
        };
    }, []);

    // Пересборка геометрии щита при изменении графа или материала корпуса.
    useEffect(() => {
        const context = contextRef.current;
        if (context === null) {
            return;
        }
        rebuildContent(context, graph, materialKind, selectedRef.current);
    }, [graph, materialKind]);

    // Подсветка выбранного узла без пересоздания сцены.
    useEffect(() => {
        const context = contextRef.current;
        if (context === null) {
            return;
        }
        context.selectedNodeId = selectedNodeId;
        updateHighlights(context);
    }, [selectedNodeId]);

    const hasPanelModules = graph.nodes.some((node) => node.panelSlot !== null);

    return (
        <section className="flex h-full w-full flex-col overflow-hidden bg-slate-950 p-4">
            <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                        {t('panel3d.title' as TranslationKey)}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        {t('panel3d.hint' as TranslationKey)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-sky-500 hover:text-sky-300"
                        onClick={() => {
                            const context = contextRef.current;
                            if (context !== null) {
                                setCameraView(context, 'front');
                            }
                        }}
                    >
                        {t('panel3d.frontView' as TranslationKey)}
                    </button>
                    <button
                        type="button"
                        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-sky-500 hover:text-sky-300"
                        onClick={() => {
                            const context = contextRef.current;
                            if (context !== null) {
                                setCameraView(context, 'reset');
                            }
                        }}
                    >
                        {t('panel3d.resetView' as TranslationKey)}
                    </button>
                    <button
                        type="button"
                        className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-amber-500 hover:text-amber-300"
                        onClick={() => {
                            setMaterialKind((current) => (current === 'metal' ? 'plastic' : 'metal'));
                        }}
                    >
                        {materialKind === 'metal'
                            ? t('panel3d.plastic' as TranslationKey)
                            : t('panel3d.metal' as TranslationKey)}
                    </button>
                </div>
            </div>

            <div
                ref={containerRef}
                className="relative min-h-0 w-full flex-1 overflow-hidden rounded border border-slate-700 bg-slate-900"
            >
                {!hasPanelModules && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                        <div className="rounded border border-dashed border-slate-500 bg-slate-900/85 px-6 py-4 text-center text-sm text-slate-300">
                            {t('panel3d.empty' as TranslationKey)}
                        </div>
                    </div>
                )}

                <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-slate-900/80 px-2 py-1 text-[10px] text-slate-400">
                    {t('panel3d.hintControls' as TranslationKey)}
                </div>

                <div className="pointer-events-none absolute right-2 top-2 rounded bg-slate-900/85 p-2 text-[10px] text-slate-300">
                    <div className="mb-1 font-semibold text-slate-200">{t('panel3d.legend' as TranslationKey)}</div>
                    <div className="space-y-0.5">
                        {(['L1', 'L2', 'L3'] as const).map((phase) => (
                            <div key={phase} className="flex items-center gap-1.5">
                                <span
                                    className="inline-block h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: phaseColor(phase) }}
                                />
                                <span>{phase}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" />
                            <span>{t('panel3d.busN' as TranslationKey)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" />
                            <span>{t('panel3d.busPe' as TranslationKey)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
