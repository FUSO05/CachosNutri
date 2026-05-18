// Base de Dados TCA-INSA (Tabela de Composição de Alimentos - INSA Portugal)
// Fonte: Instituto Nacional de Saúde Doutor Ricardo Jorge (INSA)
// Valores por 100g de parte edível
// Campos: id, nome, categoria, energia(kcal), proteina(g), hc(g), acucares(g), gordura(g), agsat(g), fibra(g), sal(g)

const TCA_DATABASE = [
  // === CEREAIS E DERIVADOS ===
  { id:1,   nome:"Arroz branco, cru",                     cat:"Cereais",      kcal:350, prot:7.3,  hc:77.7, acu:0.1,  gord:0.5,  agsat:0.1, fib:1.0,  sal:0.01 },
  { id:2,   nome:"Arroz branco, cozido",                  cat:"Cereais",      kcal:130, prot:2.7,  hc:28.7, acu:0.0,  gord:0.2,  agsat:0.1, fib:0.4,  sal:0.01 },
  { id:3,   nome:"Arroz integral, cru",                   cat:"Cereais",      kcal:351, prot:7.5,  hc:74.9, acu:0.9,  gord:2.2,  agsat:0.5, fib:3.5,  sal:0.01 },
  { id:4,   nome:"Arroz integral, cozido",                cat:"Cereais",      kcal:130, prot:2.6,  hc:25.6, acu:0.3,  gord:1.0,  agsat:0.2, fib:1.8,  sal:0.01 },
  { id:5,   nome:"Pão de trigo, tipo carcaça",            cat:"Cereais",      kcal:271, prot:9.0,  hc:53.3, acu:2.5,  gord:2.0,  agsat:0.5, fib:2.6,  sal:1.1  },
  { id:6,   nome:"Pão integral de trigo",                 cat:"Cereais",      kcal:232, prot:9.4,  hc:41.5, acu:3.2,  gord:2.8,  agsat:0.5, fib:7.0,  sal:0.8  },
  { id:7,   nome:"Pão de centeio",                        cat:"Cereais",      kcal:229, prot:8.5,  hc:43.0, acu:3.5,  gord:1.7,  agsat:0.2, fib:6.5,  sal:1.0  },
  { id:8,   nome:"Massa de trigo, crua",                  cat:"Cereais",      kcal:352, prot:11.9, hc:72.2, acu:2.7,  gord:1.5,  agsat:0.3, fib:2.8,  sal:0.01 },
  { id:9,   nome:"Massa de trigo, cozida",                cat:"Cereais",      kcal:131, prot:4.4,  hc:26.7, acu:1.0,  gord:0.6,  agsat:0.1, fib:1.0,  sal:0.01 },
  { id:10,  nome:"Esparguete, cozido",                    cat:"Cereais",      kcal:131, prot:4.5,  hc:26.7, acu:1.0,  gord:0.6,  agsat:0.1, fib:1.0,  sal:0.01 },
  { id:11,  nome:"Aveia, flocos, crus",                   cat:"Cereais",      kcal:375, prot:12.4, hc:66.3, acu:1.1,  gord:7.0,  agsat:1.3, fib:9.1,  sal:0.01 },
  { id:12,  nome:"Cornflakes",                            cat:"Cereais",      kcal:375, prot:7.0,  hc:84.0, acu:7.0,  gord:0.9,  agsat:0.2, fib:3.0,  sal:1.0  },
  { id:13,  nome:"Baguete, simples",                      cat:"Cereais",      kcal:265, prot:9.5,  hc:51.7, acu:2.0,  gord:1.5,  agsat:0.3, fib:2.2,  sal:1.2  },
  { id:14,  nome:"Biscoito, tipo Maria",                  cat:"Cereais",      kcal:433, prot:7.5,  hc:74.3, acu:22.8, gord:13.0, agsat:5.0, fib:2.1,  sal:0.5  },
  { id:15,  nome:"Pão de forma, de trigo",                cat:"Cereais",      kcal:258, prot:8.5,  hc:49.5, acu:4.5,  gord:3.3,  agsat:0.7, fib:2.5,  sal:1.1  },

  // === CARNES ===
  { id:20,  nome:"Frango, peito, sem pele, cru",          cat:"Carnes",       kcal:110, prot:23.3, hc:0.0,  acu:0.0,  gord:1.6,  agsat:0.4, fib:0.0,  sal:0.1  },
  { id:21,  nome:"Frango, peito, sem pele, grelhado",     cat:"Carnes",       kcal:165, prot:35.0, hc:0.0,  acu:0.0,  gord:3.2,  agsat:0.9, fib:0.0,  sal:0.1  },
  { id:22,  nome:"Frango, coxa, sem pele, cozido",        cat:"Carnes",       kcal:157, prot:25.0, hc:0.0,  acu:0.0,  gord:5.8,  agsat:1.6, fib:0.0,  sal:0.2  },
  { id:23,  nome:"Peru, peito, sem pele, cru",            cat:"Carnes",       kcal:105, prot:22.7, hc:0.0,  acu:0.0,  gord:1.4,  agsat:0.4, fib:0.0,  sal:0.1  },
  { id:24,  nome:"Vaca, bife, grelhado",                  cat:"Carnes",       kcal:183, prot:30.0, hc:0.0,  acu:0.0,  gord:6.5,  agsat:2.6, fib:0.0,  sal:0.1  },
  { id:25,  nome:"Vaca, carne picada, estufada",          cat:"Carnes",       kcal:208, prot:27.0, hc:0.0,  acu:0.0,  gord:11.0, agsat:4.3, fib:0.0,  sal:0.2  },
  { id:26,  nome:"Porco, lombo, grelhado",                cat:"Carnes",       kcal:167, prot:28.0, hc:0.0,  acu:0.0,  gord:5.5,  agsat:2.0, fib:0.0,  sal:0.1  },
  { id:27,  nome:"Porco, entrecosto, assado",             cat:"Carnes",       kcal:263, prot:24.0, hc:0.0,  acu:0.0,  gord:17.9, agsat:6.7, fib:0.0,  sal:0.2  },
  { id:28,  nome:"Borrego, perna, assada",                cat:"Carnes",       kcal:191, prot:25.7, hc:0.0,  acu:0.0,  gord:9.2,  agsat:3.9, fib:0.0,  sal:0.2  },
  { id:29,  nome:"Vitela, escalope, grelhado",            cat:"Carnes",       kcal:175, prot:29.8, hc:0.0,  acu:0.0,  gord:5.5,  agsat:2.0, fib:0.0,  sal:0.1  },
  { id:30,  nome:"Fiambre de porco",                      cat:"Carnes",       kcal:107, prot:18.0, hc:1.5,  acu:1.5,  gord:3.2,  agsat:1.1, fib:0.0,  sal:2.0  },
  { id:31,  nome:"Chouriço de carne",                     cat:"Carnes",       kcal:384, prot:21.0, hc:2.0,  acu:0.5,  gord:32.0, agsat:11.5,fib:0.0,  sal:3.5  },
  { id:32,  nome:"Alheira de vinhais",                    cat:"Carnes",       kcal:285, prot:15.0, hc:15.0, acu:1.0,  gord:18.5, agsat:6.0, fib:1.0,  sal:2.5  },
  { id:33,  nome:"Presunto",                              cat:"Carnes",       kcal:196, prot:26.0, hc:0.5,  acu:0.5,  gord:10.0, agsat:3.5, fib:0.0,  sal:3.0  },

  // === PEIXES E MARISCOS ===
  { id:40,  nome:"Bacalhau, salgado seco, demolhado, cozido", cat:"Peixes",  kcal:117, prot:25.9, hc:0.0,  acu:0.0,  gord:1.4,  agsat:0.3, fib:0.0,  sal:0.8  },
  { id:41,  nome:"Salmão, cru",                           cat:"Peixes",       kcal:179, prot:20.0, hc:0.0,  acu:0.0,  gord:10.9, agsat:2.0, fib:0.0,  sal:0.1  },
  { id:42,  nome:"Salmão, grelhado",                      cat:"Peixes",       kcal:216, prot:25.5, hc:0.0,  acu:0.0,  gord:12.4, agsat:2.2, fib:0.0,  sal:0.1  },
  { id:43,  nome:"Sardinha, grelhada",                    cat:"Peixes",       kcal:178, prot:23.6, hc:0.0,  acu:0.0,  gord:9.0,  agsat:2.5, fib:0.0,  sal:0.3  },
  { id:44,  nome:"Sardinha em conserva, em azeite",       cat:"Peixes",       kcal:210, prot:24.6, hc:0.0,  acu:0.0,  gord:12.0, agsat:2.8, fib:0.0,  sal:0.9  },
  { id:45,  nome:"Atum em conserva, ao natural",          cat:"Peixes",       kcal:109, prot:23.5, hc:0.0,  acu:0.0,  gord:1.0,  agsat:0.3, fib:0.0,  sal:0.4  },
  { id:46,  nome:"Pescada, cozida",                       cat:"Peixes",       kcal:95,  prot:19.5, hc:0.0,  acu:0.0,  gord:1.5,  agsat:0.4, fib:0.0,  sal:0.2  },
  { id:47,  nome:"Dourada, grelhada",                     cat:"Peixes",       kcal:128, prot:22.5, hc:0.0,  acu:0.0,  gord:3.9,  agsat:0.9, fib:0.0,  sal:0.2  },
  { id:48,  nome:"Robalo, grelhado",                      cat:"Peixes",       kcal:124, prot:23.0, hc:0.0,  acu:0.0,  gord:3.3,  agsat:0.7, fib:0.0,  sal:0.2  },
  { id:49,  nome:"Camarão, cozido",                       cat:"Peixes",       kcal:98,  prot:21.2, hc:0.0,  acu:0.0,  gord:1.1,  agsat:0.2, fib:0.0,  sal:0.8  },
  { id:50,  nome:"Polvo, cozido",                         cat:"Peixes",       kcal:82,  prot:16.7, hc:1.0,  acu:0.0,  gord:1.0,  agsat:0.2, fib:0.0,  sal:0.3  },
  { id:51,  nome:"Amêijoas, cozidas",                     cat:"Peixes",       kcal:74,  prot:12.8, hc:2.5,  acu:0.0,  gord:0.9,  agsat:0.2, fib:0.0,  sal:0.4  },
  { id:52,  nome:"Lulas, grelhadas",                      cat:"Peixes",       kcal:92,  prot:15.6, hc:3.1,  acu:0.0,  gord:1.5,  agsat:0.4, fib:0.0,  sal:0.2  },

  // === OVOS ===
  { id:60,  nome:"Ovo de galinha, inteiro, cru",          cat:"Ovos",         kcal:143, prot:12.5, hc:0.6,  acu:0.6,  gord:10.0, agsat:2.9, fib:0.0,  sal:0.4  },
  { id:61,  nome:"Ovo de galinha, cozido",                cat:"Ovos",         kcal:149, prot:12.5, hc:0.6,  acu:0.6,  gord:10.6, agsat:3.1, fib:0.0,  sal:0.4  },
  { id:62,  nome:"Ovo de galinha, mexido, sem manteiga",  cat:"Ovos",         kcal:160, prot:13.8, hc:0.6,  acu:0.6,  gord:11.5, agsat:3