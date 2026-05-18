# NutriPlan

Webapp de planeamento alimentar para nutricionistas, com a base de dados TCA-INSA completa.

## Funcionalidades

- **1376 alimentos reais** da Tabela de Composição de Alimentos (BDCA v7.1 2026), INSA Portugal
- **Plano semanal** — 7 dias, refeições dinâmicas (adicionar/remover/renomear)
- **Pesquisa em tempo real** com filtro por categoria
- **Macros por porção** — ajuste de gramas com recálculo automático
- **Piechart** sempre visível com totais do dia (kcal, proteína, HC, lípidos)
- **Persistência local** — plano guardado automaticamente no browser
- **Impressão** — layout limpo para imprimir ou exportar para PDF

## Como usar localmente

Não precisa de servidor. Basta abrir:

```
index.html
```

no browser (Chrome, Firefox, Edge, Safari).

## Deploy — GitHub Pages (gratuito)

```bash
# 1. Criar repo no GitHub: github.com/new
git clone https://github.com/teu-user/nutriplan.git
cd nutriplan

# 2. Copiar estes ficheiros para a pasta
# (ou mover directamente)

# 3. Push
git add .
git commit -m "NutriPlan v1.0"
git push origin main

# 4. Activar GitHub Pages
# → Settings → Pages → Source: main branch / root
# URL: https://teu-user.github.io/nutriplan
```

## Deploy — Netlify (arrastar e largar)

1. Ir a [netlify.com](https://netlify.com)
2. Arrastar a pasta `nutriplan/` para a área de deploy
3. URL gerado automaticamente: `https://xxxxx.netlify.app`

## Estrutura

```
nutriplan/
├── index.html          # App principal
├── css/
│   └── style.css       # Estilos completos
├── js/
│   ├── tca_data.js     # Base de dados TCA-INSA (1376 alimentos, 237KB)
│   └── app.js          # Lógica da aplicação
└── README.md
```

## Fonte dos dados

**INSA — Instituto Nacional de Saúde Doutor Ricardo Jorge**  
Tabela de Composição de Alimentos (BDCA), versão 7.1, 2026  
https://portfir.insa.min-saude.pt/

Campos incluídos por alimento: energia (kcal/kJ), lípidos, ácidos gordos saturados, hidratos de carbono, açúcares, sal, fibra, proteínas, colesterol, água.
