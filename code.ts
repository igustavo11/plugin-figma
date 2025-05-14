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
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};
