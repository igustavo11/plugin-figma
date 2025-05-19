figma.showUI(__html__, { width: 500, height: 500 });

// propriedades que cada tipo de nó pode ter
const NODE_PROPS = {
  BASE: [
    "type",
    "name",
    "id",
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "opacity",
    "blendMode",
    "children",
    "fills",
    "strokes",
    "strokeWeight",
    "strokeAlign",
    "strokeCap",
    "strokeJoin",
    "strokeMiterLimit",
    "strokeDashes",
    "effects",
    "constraints",
    "layoutAlign",
    "layoutGrow",
    "isMask",
    "maskType",
    "fillStyleId",
    "strokeStyleId",
    "effectStyleId",
    "gridStyleId",
    "visible",
  ],
  RECTANGLE: [
    "cornerRadius",
    "cornerSmoothing",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
  ],
  TEXT: [
    "characters",
    "fontSize",
    "fontName",
    "textAlignHorizontal",
    "textAlignVertical",
    "textAutoResize",
    "textCase",
    "textDecoration",
    "letterSpacing",
    "lineHeight",
    "textStyleId",
  ],
  FRAME: [
    "layoutMode",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "layoutGrids",
    "clipsContent",
  ],
  COMPONENT: [
    "layoutMode",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "layoutGrids",
    "clipsContent",
  ],
  INSTANCE: [
    "layoutMode",
    "primaryAxisSizingMode",
    "counterAxisSizingMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "layoutGrids",
    "clipsContent",
    "componentId",
    "overrideProperties",
  ],
  ELLIPSE: ["arcData"],
  POLYGON: ["pointCount"],
  STAR: ["pointCount", "innerRadius"],
  VECTOR: ["vectorNetwork", "vectorPaths"],
};

// pega os dados do nó e transforma em json
function extractNodeDataAsJson(node) {
  let children = [];
  if ("children" in node && Array.isArray(node.children)) {
    children = node.children.map(extractNodeDataAsJson);
  }

  const data = {};
  for (const prop of NODE_PROPS.BASE) {
    if (prop === "children") {
      data.children = children;
    } else if (prop.endsWith("StyleId")) {
      data[prop] = node[prop] ? String(node[prop]) : undefined;
    } else {
      data[prop] = node[prop];
    }
  }

  const typeProps = NODE_PROPS[node.type];
  if (typeProps) {
    for (const prop of typeProps) {
      if (prop === "overrideProperties" && node.overrides) {
        data.overrideProperties = node.overrides.map((obj) => ({
          id: obj.id,
          property: obj.property,
          value: obj.value,
        }));
      } else if (prop === "componentId" && node.componentId) {
        data.componentId = String(node.componentId);
      } else {
        data[prop] = node[prop];
      }
    }
  }

  return data;
}

// checa se o nó criado ficou igual ao original
function verifyNodeIntegrity(originalJson, createdNode) {
  const issues = [];

  if (originalJson.name !== createdNode.name) {
    issues.push(
      `nome diferente: ${createdNode.name} (deveria ser ${originalJson.name})`
    );
  }

  if (
    originalJson.children &&
    "children" in createdNode &&
    originalJson.children.length !== createdNode.children.length
  ) {
    issues.push(
      `número de filhos diferente: ${createdNode.children.length} (deveria ter ${originalJson.children.length})`
    );
  }

  if (issues.length > 0) {
    console.error("problemas na clonagem:", issues);
    return false;
  }

  return true;
}

// cria um nó a partir do json
async function createNodeFromJson(json, parent = figma.currentPage) {
  let node;

  try {
    switch (json.type) {
      case "FRAME":
        node = figma.createFrame();
        break;
      case "RECTANGLE":
        node = figma.createRectangle();
        break;
      case "ELLIPSE":
        node = figma.createEllipse();
        break;
      case "POLYGON":
        node = figma.createPolygon();
        break;
      case "STAR":
        node = figma.createStar();
        break;
      case "LINE":
        node = figma.createLine();
        break;
      case "TEXT":
        node = figma.createText();
        break;
      case "COMPONENT":
        node = figma.createComponent();
        break;
      case "GROUP":
        if (json.children && json.children.length > 0) {
          const childNodes = [];
          for (const childJson of json.children) {
            try {
              const child = await createNodeFromJson(childJson, parent);
              if (child && childJson.isMask !== undefined) {
                child.isMask = childJson.isMask;
              }
              childNodes.push(child);
            } catch (err) {
              console.error("erro ao criar filho do grupo:", err);
            }
          }
          if (childNodes.length > 0) {
            node = figma.group(childNodes, parent);
            if (json.name) node.name = json.name;
            for (let i = 0; i < childNodes.length; i++) {
              if (json.children[i].isMask !== undefined) {
                childNodes[i].isMask = json.children[i].isMask;
              }
            }
            await processMaskStructure(node);
            if (json.x !== undefined && json.y !== undefined) {
              const currentBounds = node.getBoundingBox();
              const xOffset = json.x - currentBounds.x;
              const yOffset = json.y - currentBounds.y;
              if (xOffset !== 0 || yOffset !== 0) {
                node.x += xOffset;
                node.y += yOffset;
              }
            }
          } else {
            return null;
          }
        } else {
          return null;
        }
        break;
      case "INSTANCE":
        if (json.componentId) {
          const component = figma.getComponentById(json.componentId);
          if (component) {
            node = figma.createInstance(component);
            if (json.overrideProperties && json.overrideProperties.length > 0) {
              for (const override of json.overrideProperties) {
                try {
                  const overrideNode = node.findOne(
                    (node) => node.id === override.id
                  );
                  if (
                    overrideNode &&
                    override.property &&
                    override.value !== undefined
                  ) {
                    overrideNode[override.property] = override.value;
                  }
                } catch (err) {
                  console.error("erro ao aplicar override:", err);
                }
              }
            }
          } else {
            console.error("componente não encontrado:", json.componentId);
            return null;
          }
        } else {
          console.error("id do componente não fornecido para instância");
          return null;
        }
        break;
      case "VECTOR":
        node = figma.createVector();
        if (json.vectorPaths && json.vectorPaths.length > 0) {
          node.vectorPaths = json.vectorPaths;
        }
        if (json.vectorNetwork) {
          try {
            node.vectorNetwork = json.vectorNetwork;
          } catch (err) {
            console.error("não foi possível aplicar vectorNetwork:", err);
          }
        }
        break;
      default:
        console.error("tipo de nó não suportado:", json.type);
        return null;
    }

    node.name = json.name || node.type.toLowerCase();

    if (json.isMask !== undefined) {
      node.isMask = json.isMask;
    }

    if (
      (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") &&
      json.maskType !== undefined
    ) {
      node.maskType = json.maskType;
    }

    if (node.type !== "GROUP") {
      node.x = json.x ?? 0;
      node.y = json.y ?? 0;
      if ("resize" in node) {
        node.resize(json.width ?? 100, json.height ?? 100);
      }
    }

    if (json.rotation !== undefined) node.rotation = json.rotation;
    if (json.opacity !== undefined) node.opacity = json.opacity;
    if (json.blendMode !== undefined) node.blendMode = json.blendMode;
    if (json.constraints) node.constraints = json.constraints;

    if (json.fills) {
      const processedFills = processFills(json.fills);
      node.fills = processedFills;
    }

    if (json.strokes) node.strokes = json.strokes;
    if (json.strokeWeight !== undefined) node.strokeWeight = json.strokeWeight;
    if (json.strokeAlign !== undefined) node.strokeAlign = json.strokeAlign;
    if (json.strokeCap !== undefined) node.strokeCap = json.strokeCap;
    if (json.strokeJoin !== undefined) node.strokeJoin = json.strokeJoin;
    if (json.strokeDashes !== undefined) node.strokeDashes = json.strokeDashes;
    if (json.effects) node.effects = json.effects;
    if (json.visible !== undefined) node.visible = json.visible;

    if (json.type === "TEXT") {
      await handleTextNode(node, json);
    }

    await applyStyles(node, json);

    if (json.type === "RECTANGLE") {
      if (json.cornerRadius !== undefined)
        node.cornerRadius = json.cornerRadius;
      if (json.cornerSmoothing !== undefined)
        node.cornerSmoothing = json.cornerSmoothing;
      if (json.topLeftRadius !== undefined)
        node.topLeftRadius = json.topLeftRadius;
      if (json.topRightRadius !== undefined)
        node.topRightRadius = json.topRightRadius;
      if (json.bottomLeftRadius !== undefined)
        node.bottomLeftRadius = json.bottomLeftRadius;
      if (json.bottomRightRadius !== undefined)
        node.bottomRightRadius = json.bottomRightRadius;
    } else if (json.type === "FRAME" || json.type === "COMPONENT") {
      if (json.layoutMode !== undefined) node.layoutMode = json.layoutMode;
      if (json.primaryAxisSizingMode !== undefined)
        node.primaryAxisSizingMode = json.primaryAxisSizingMode;
      if (json.counterAxisSizingMode !== undefined)
        node.counterAxisSizingMode = json.counterAxisSizingMode;
      if (json.primaryAxisAlignItems !== undefined)
        node.primaryAxisAlignItems = json.primaryAxisAlignItems;
      if (json.counterAxisAlignItems !== undefined)
        node.counterAxisAlignItems = json.counterAxisAlignItems;
      if (json.paddingLeft !== undefined) node.paddingLeft = json.paddingLeft;
      if (json.paddingRight !== undefined)
        node.paddingRight = json.paddingRight;
      if (json.paddingTop !== undefined) node.paddingTop = json.paddingTop;
      if (json.paddingBottom !== undefined)
        node.paddingBottom = json.paddingBottom;
      if (json.itemSpacing !== undefined) node.itemSpacing = json.itemSpacing;
      if (json.clipsContent !== undefined)
        node.clipsContent = json.clipsContent;
      if (json.layoutGrids !== undefined) node.layoutGrids = json.layoutGrids;
    } else if (json.type === "POLYGON" || json.type === "STAR") {
      if (json.pointCount !== undefined) node.pointCount = json.pointCount;
      if (json.type === "STAR" && json.innerRadius !== undefined)
        node.innerRadius = json.innerRadius;
    } else if (json.type === "ELLIPSE") {
      if (json.arcData !== undefined) node.arcData = json.arcData;
    }

    if (json.layoutAlign !== undefined) node.layoutAlign = json.layoutAlign;
    if (json.layoutGrow !== undefined) node.layoutGrow = json.layoutGrow;

    if (json.type !== "GROUP") {
      parent.appendChild(node);
      if (
        json.children &&
        Array.isArray(json.children) &&
        "children" in node &&
        typeof node.appendChild === "function"
      ) {
        for (const childJson of json.children) {
          await createNodeFromJson(childJson, node);
        }
      }
    }

    return node;
  } catch (error) {
    console.error(
      `erro ao criar nó do tipo ${json.type || "desconhecido"}:`,
      error
    );
    console.log(
      "json parcial:",
      JSON.stringify(json).substring(0, 200) + "..."
    );
    figma.notify(
      `erro ao criar ${json.type || "desconhecido"}: ${error.message}`,
      { timeout: 5000 }
    );
    return null;
  }
}

// deixa os dados prontos pra mandar pra interface
function sanitizeForPostMessage(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForPostMessage(item));
  }

  if (typeof obj === "object") {
    const result = {};

    for (const key in obj) {
      try {
        const value = obj[key];
        if (
          value &&
          typeof value === "object" &&
          value.type &&
          typeof value.type === "symbol"
        ) {
          result[key] = `[Symbol: ${String(value.type)}]`;
        } else if (typeof value === "symbol") {
          result[key] = String(value);
        } else if (typeof value === "object") {
          result[key] = sanitizeForPostMessage(value);
        } else if (typeof value === "function") {
          result[key] = "[Function]";
        } else {
          result[key] = value;
        }
      } catch (err) {
        result[key] = "[Cannot Access]";
      }
    }

    return result;
  }

  return obj;
}

// trata o nó de texto (carrega fonte, aplica configs)
async function handleTextNode(node, json) {
  const fontName = json.fontName || { family: "Inter", style: "Regular" };
  try {
    await figma.loadFontAsync(fontName);
    node.fontName = fontName;
  } catch (e) {
    figma.notify(`fonte não encontrada: ${JSON.stringify(fontName)}`, {
      timeout: 4000,
    });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    node.fontName = { family: "Inter", style: "Regular" };
  }

  if (json.characters !== undefined) node.characters = json.characters;
  if (json.fontSize !== undefined) node.fontSize = json.fontSize;
  if (json.textAlignHorizontal !== undefined)
    node.textAlignHorizontal = json.textAlignHorizontal;
  if (json.textAlignVertical !== undefined)
    node.textAlignVertical = json.textAlignVertical;
  if (json.textAutoResize !== undefined)
    node.textAutoResize = json.textAutoResize;
  if (json.textCase !== undefined) node.textCase = json.textCase;
  if (json.textDecoration !== undefined)
    node.textDecoration = json.textDecoration;
  if (json.letterSpacing !== undefined) node.letterSpacing = json.letterSpacing;
  if (json.lineHeight !== undefined) node.lineHeight = json.lineHeight;

  if (json.fills) node.fills = json.fills;

  if (json.textStyleId) {
    try {
      const style = figma.getStyleById(json.textStyleId);
      if (style) node.textStyleId = style.id;
    } catch (e) {
      console.error("estilo de texto não encontrado:", json.textStyleId);
    }
  }
}

// aplica estilos de preenchimento, traço, efeito e grade
async function applyStyles(node, json) {
  if (json.fillStyleId) {
    try {
      const style = figma.getStyleById(json.fillStyleId);
      if (style) node.fillStyleId = style.id;
    } catch (e) {
      console.error(
        "estilo de preenchimento não encontrado:",
        json.fillStyleId
      );
    }
  }

  if (json.strokeStyleId) {
    try {
      const style = figma.getStyleById(json.strokeStyleId);
      if (style) node.strokeStyleId = style.id;
    } catch (e) {
      console.error("estilo de traço não encontrado:", json.strokeStyleId);
    }
  }

  if (json.effectStyleId) {
    try {
      const style = figma.getStyleById(json.effectStyleId);
      if (style) node.effectStyleId = style.id;
    } catch (e) {
      console.error("estilo de efeito não encontrado:", json.effectStyleId);
    }
  }

  if (json.gridStyleId) {
    try {
      const style = figma.getStyleById(json.gridStyleId);
      if (style) node.gridStyleId = style.id;
    } catch (e) {
      console.error("estilo de grade não encontrado:", json.gridStyleId);
    }
  }
}

// processa fills de imagem pra trocar imageRef por imageHash
function processFills(fills) {
  if (!fills || !Array.isArray(fills)) return fills;
  return fills.map((fill) => {
    if (fill.type === "IMAGE" && fill.imageRef) {
      return { ...fill, imageHash: fill.imageRef };
    }
    return fill;
  });
}

// ajusta estrutura de máscara nos grupos
async function processMaskStructure(parentNode) {
  if (
    !("children" in parentNode) ||
    !parentNode.children ||
    parentNode.children.length === 0
  ) {
    return;
  }

  for (let i = 0; i < parentNode.children.length; i++) {
    const child = parentNode.children[i];
    if (child.isMask) {
      let nextUnmaskedIndex = i + 1;
      while (
        nextUnmaskedIndex < parentNode.children.length &&
        parentNode.children[nextUnmaskedIndex].isMaskable !== false
      ) {
        nextUnmaskedIndex++;
      }
      if (nextUnmaskedIndex > i + 1) {
        figma.notify(
          `máscara aplicada em ${child.name} com ${
            nextUnmaskedIndex - i - 1
          } elementos`,
          { timeout: 2000 }
        );
      }
    }
  }
}

// recebe mensagens da interface e executa as ações
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case "extract-frame": {
      const selection = figma.currentPage.selection;
      console.log("seleção atual:", selection);

      if (selection.length === 0) {
        figma.ui.postMessage({
          type: "error",
          message: "selecione um frame ou grupo",
        });
        return;
      }

      try {
        const frameData = selection.map(extractNodeDataAsJson);
        const sanitizedData = sanitizeForPostMessage(frameData);
        figma.ui.postMessage({
          type: "frame-data",
          data: sanitizedData,
          message: `dados extraídos de ${selection.length} item(s)`,
        });
      } catch (error) {
        console.error("erro completo:", error);
        figma.ui.postMessage({
          type: "error",
          message: `erro ao extrair dados: ${
            error.message || "erro desconhecido"
          }`,
        });
      }
      break;
    }

    case "import-json": {
      const json = msg.data.document;
      await createNodeFromJson(json, figma.currentPage);
      figma.notify("importação concluída!");
      break;
    }

    case "create-frame": {
      const jsonArr = Array.isArray(msg.data) ? msg.data : [msg.data];
      let successCount = 0;
      let lastCreatedNode = null;

      for (const json of jsonArr) {
        try {
          const node = await createNodeFromJson(json, figma.currentPage);
          if (node) {
            successCount++;
            lastCreatedNode = node;
          }
        } catch (e) {
          console.error("erro ao criar frame a partir do json:", e);
        }
      }

      if (successCount > 0) {
        figma.notify(`frames criados com sucesso: ${successCount}`, {
          timeout: 3000,
        });

        if (lastCreatedNode) {
          figma.currentPage.selection = [lastCreatedNode];
          figma.viewport.scrollAndZoomIntoView([lastCreatedNode]);
        }
      } else {
        figma.notify("nenhum frame foi criado.", { timeout: 3000 });
      }
      break;
    }

    case "apply-mask-structure": {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.notify("nenhum nó selecionado para aplicar máscara.", {
          timeout: 3000,
        });
        return;
      }

      for (const node of selection) {
        await processMaskStructure(node);
      }

      figma.notify("estrutura de máscara aplicada.", { timeout: 3000 });
      break;
    }
  }
};
