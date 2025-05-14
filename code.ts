figma.showUI(__html__, { width: 400, height: 600 });

// extrair JSON usando a API nativa do Figma
async function extractNodeDataAsJson(node) {
  try {
    const jsonData = await node.exportAsync({ format: "JSON_REST_V1" });

    if (typeof jsonData === "string") {
      return JSON.parse(jsonData);
    } else {
      return jsonData;
    }
  } catch (error) {
    console.error(`Erro ao exportar JSON para ${node.name}:`, error);
    throw error;
  }
}

// Função para converter elementos para base64
async function convertToBase64(input) {
  // Se for null ou undefined, retorne como está
  if (input == null) return input;

  // converte para base64
  if (typeof input === "object" && "exportAsync" in input) {
    try {
      const bytes = await input.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 1 },
      });
      return `data:image/png;base64,${figma.base64Encode(bytes)}`;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  // tenta converter para JSON se possível
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return await convertToBase64(parsed);
    } catch {
      return input;
    }
  }

  // processa cada item
  if (Array.isArray(input)) {
    const results = [];
    for (const item of input) {
      results.push(await convertToBase64(item));
    }
    return results;
  }

  // processa imageRef e propriedades
  if (typeof input === "object") {
    // rocessa imageRef primeiro
    if (input.type === "IMAGE" && input.imageRef) {
      try {
        const image = figma.getImageByHash(input.imageRef);
        if (image) {
          const bytes = await image.getBytesAsync();
          input.base64Image = `data:image/png;base64,${figma.base64Encode(
            bytes
          )}`;
        }
      } catch (error) {
        console.error(error);
      }
    }

    // Processa todas as propriedades do objeto
    for (const key in input) {
      if (input[key] !== undefined) {
        input[key] = await convertToBase64(input[key]);
      }
    }
  }

  return input;
}

// Função para criar frames a partir do JSON
async function createFrameFromJson(jsonData) {
  try {
    // Create a new frame
    const frame = figma.createFrame();
    frame.name = jsonData.name || "Imported Frame";

    // Set position
    frame.x = figma.viewport.center.x - 1920 / 2;
    frame.y = figma.viewport.center.y - 1080 / 2;

    // Usar absoluteRenderBounds para definir as dimensões exatas
    if (jsonData.absoluteRenderBounds) {
      // Usar dimensões exatas do absoluteRenderBounds
      const { width, height } = jsonData.absoluteRenderBounds;
      frame.resize(width, height);
    } else if (jsonData.absoluteBoundingBox) {
      // Fallback para absoluteBoundingBox
      const { width, height } = jsonData.absoluteBoundingBox;
      frame.resize(width, height);
    } else if (jsonData.size) {
      // Alternativa se houver propriedade size
      frame.resize(jsonData.size.width || 1920, jsonData.size.height || 1080);
    } else if (jsonData.width && jsonData.height) {
      // Outra alternativa se houver propriedades width e height diretamente
      frame.resize(jsonData.width, jsonData.height);
    } else {
      // Caso não encontre dimensões, use 1920x1080
      console.warn("Usando dimensões padrão 1920x1080");
      frame.resize(970, 250);
    }

    // Aplicar estilos exatamente como no original
    if (jsonData.fills && jsonData.fills.length > 0) {
      // Tenta usar os preenchimentos originais
      try {
        frame.fills = jsonData.fills;
      } catch (e) {
        console.warn(
          "Não foi possível aplicar os preenchimentos originais:",
          e
        );

        // Fallback para backgroundColor se disponível
        if (jsonData.backgroundColor) {
          frame.fills = [
            {
              type: "SOLID",
              color: {
                r: jsonData.backgroundColor.r || 1,
                g: jsonData.backgroundColor.g || 1,
                b: jsonData.backgroundColor.b || 1,
              },
              opacity: jsonData.backgroundColor.a || 1,
            },
          ];
        }
      }
    } else if (jsonData.backgroundColor) {
      // Usar backgroundColor como fallback
      frame.fills = [
        {
          type: "SOLID",
          color: {
            r: jsonData.backgroundColor.r || 1,
            g: jsonData.backgroundColor.g || 1,
            b: jsonData.backgroundColor.b || 1,
          },
          opacity: jsonData.backgroundColor.a || 1,
        },
      ];
    }

    // Aplicar outros estilos se disponíveis
    if (jsonData.strokes) {
      try {
        frame.strokes = jsonData.strokes;
      } catch (e) {
        console.warn("Não foi possível aplicar os traços originais:", e);
      }
    }

    if (jsonData.strokeWeight !== undefined) {
      frame.strokeWeight = jsonData.strokeWeight;
    }

    if (jsonData.cornerRadius !== undefined) {
      frame.cornerRadius = jsonData.cornerRadius;
    }

    // If image data is available, create an image fill
    if (jsonData.imageBase64 && typeof jsonData.imageBase64 === "string") {
      // Extract base64 data (remove "data:image/png;base64," prefix)
      const base64Data = jsonData.imageBase64.split(",")[1];
      if (base64Data) {
        const imageHash = figma.createImage(
          figma.base64Decode(base64Data)
        ).hash;

        // Create rectangle with image fill that matches the frame size exactly
        const rect = figma.createRectangle();
        rect.resize(frame.width, frame.height);
        rect.x = 0;
        rect.y = 0;
        rect.fills = [
          {
            type: "IMAGE",
            scaleMode: "FILL",
            imageHash: imageHash,
          },
        ];
        frame.appendChild(rect);
      }
    }

    // Processar filhos recursivamente se existirem
    if (jsonData.children && Array.isArray(jsonData.children)) {
      for (const childData of jsonData.children) {
        try {
          // Esta seria uma implementação recursiva para adicionar elementos filhos
          // Esta parte é complexa e exigiria uma função separada mais detalhada
          console.log("Filho detectado mas não implementado:", childData.name);
        } catch (e) {
          console.warn("Erro ao processar filho:", e);
        }
      }
    }

    // Add the frame to the current page
    figma.currentPage.appendChild(frame);

    // Select the new frame
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);

    return frame;
  } catch (error) {
    console.error("Error creating frame from JSON:", error);
    throw error;
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === "extract-frame") {
    const selection = figma.currentPage.selection;
    console.log("Seleção atual:", selection);

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "error",
        message: "Selecione um frame ou grupo",
      });
      return;
    }

    try {
      // Extrair JSON de cada nó selecionado e adicionar base64 para cada imageRef
      const frameData = await Promise.all(
        selection.map(async (node) => {
          // obter o JSON
          let jsonData = await extractNodeDataAsJson(node);

          // converter o JSON e todas as suas imagens para base64
          jsonData = await convertToBase64(jsonData);

          // converter o nó principal para base64 também
          const imageBase64 = await convertToBase64(node);

          //representação base64 ao objeto JSON
          return {
            ...jsonData,
            imageBase64,
          };
        })
      );

      // Enviar os dados para a UI
      figma.ui.postMessage({
        type: "frame-data",
        data: frameData,
        message: `Dados extraídos de ${selection.length} item(s)`,
      });
    } catch (error) {
      console.error("Erro completo:", error);
      figma.ui.postMessage({
        type: "error",
        message: `Erro ao extrair dados: ${
          error.message || "Erro desconhecido"
        }`,
      });
    }
  } else if (msg.type === "create-frame") {
    try {
      console.log("Dados JSON recebidos:", msg.data); // Log dos dados recebidos

      if (!msg.data || !Array.isArray(msg.data) || msg.data.length === 0) {
        figma.ui.postMessage({
          type: "error",
          message: "Nenhum dado JSON válido recebido",
        });
        return;
      }

      const frames = [];

      // Process each extracted JSON to create frames
      for (const item of msg.data) {
        const frame = await createFrameFromJson(item);
        frames.push(frame);
      }

      figma.ui.postMessage({
        type: "success",
        message: `Criado(s) ${frames.length} frame(s) com sucesso!`,
      });
    } catch (error) {
      console.error("Erro ao criar frames:", error);
      figma.ui.postMessage({
        type: "error",
        message: `Erro ao criar frames: ${
          error.message || "Erro desconhecido"
        }`,
      });
    }
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};
