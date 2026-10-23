-- Unités de mesure au choix (g, ml, cuillère à café, cuillère à soupe, unité) et nouveaux aliments.
-- Les quantités restent stockées en grammes ; « unite » mémorise seulement l'unité d'affichage et de saisie.
alter table public.aliments add column if not exists cac_g numeric(6,1);   -- poids d'une cuillère à café
alter table public.aliments add column if not exists cas_g numeric(6,1);   -- poids d'une cuillère à soupe
alter table public.aliments add column if not exists densite numeric(5,3); -- g par ml (liquides)
alter table public.repas_aliments add column if not exists unite text check (unite in ('g', 'ml', 'cac', 'cas', 'u'));
alter table public.journal_aliments add column if not exists unite text check (unite in ('g', 'ml', 'cac', 'cas', 'u'));

insert into public.aliments(categorie, nom, kcal, proteines, glucides, lipides, unite_nom, unite_pluriel, unite_g, cac_g, cas_g, densite) values
('Viandes','Blanc de poulet cru',120,23,0,2.5,null,null,null,null,null,null),
('Viandes','Poulet rôti avec la peau',215,27,0,12,null,null,null,null,null,null),
('Viandes','Cuisse de dinde cuite',160,28,0,5.5,null,null,null,null,null,null),
('Viandes','Rôti de boeuf cuit',175,29,0,6.5,null,null,null,null,null,null),
('Viandes','Rumsteck grillé',165,30,0,5,null,null,null,null,null,null),
('Viandes','Boeuf haché 5% MG cru',125,21,0,5,null,null,null,null,null,null),
('Viandes','Boeuf haché 15% MG cru',210,18,0,15,null,null,null,null,null,null),
('Viandes','Côte de porc grillée',230,28,0,13,null,null,null,null,null,null),
('Viandes','Gigot d''agneau rôti',230,26,0,14,null,null,null,null,null,null),
('Viandes','Magret de canard cuit sans peau',200,27,0,10,null,null,null,null,null,null),
('Viandes','Lapin cuit',175,30,0,6,null,null,null,null,null,null),
('Viandes','Foie de volaille cuit',165,25,1,6.5,null,null,null,null,null,null),
('Viandes','Lardons fumés cuits',300,17,0.5,26,null,null,null,null,null,null),
('Viandes','Bacon grillé',420,33,1,32,'tranche','tranches',10,null,null,null),
('Viandes','Jambon cru',250,28,0.5,15,'tranche','tranches',15,null,null,null),
('Viandes','Blanc de poulet en tranches',105,21,1,2,'tranche','tranches',20,null,null,null),
('Viandes','Bresaola',155,32,0.5,2.5,'tranche','tranches',8,null,null,null),
('Viandes','Saucisse de volaille cuite',210,16,2,15,'saucisse','saucisses',50,null,null,null),
('Viandes','Chipolata cuite',270,16,1,22,'chipolata','chipolatas',50,null,null,null),
('Viandes','Merguez cuite',300,16,1,26,'merguez','merguez',50,null,null,null),
('Poissons','Saumon cru',190,20,0,12.5,null,null,null,null,null,null),
('Poissons','Saumon fumé',180,22,0.5,10,'tranche','tranches',25,null,null,null),
('Poissons','Thon frais cuit',140,30,0,2,null,null,null,null,null,null),
('Poissons','Thon à l''huile égoutté',190,26,0,9.5,null,null,null,null,null,null),
('Poissons','Colin (lieu) cuit',95,21,0,1,null,null,null,null,null,null),
('Poissons','Merlu cuit',95,20,0,1.5,null,null,null,null,null,null),
('Poissons','Sole cuite',100,20,0,2,null,null,null,null,null,null),
('Poissons','Truite cuite',160,23,0,7.5,null,null,null,null,null,null),
('Poissons','Bar cuit',125,24,0,3,null,null,null,null,null,null),
('Poissons','Dorade cuite',135,24,0,4.5,null,null,null,null,null,null),
('Poissons','Sardines fraîches cuites',185,25,0,9.5,null,null,null,null,null,null),
('Poissons','Maquereau à la tomate (conserve)',185,14,3,13,null,null,null,null,null,null),
('Poissons','Hareng fumé',220,22,0,14.5,null,null,null,null,null,null),
('Poissons','Moules cuites',120,20,3.5,3,null,null,null,null,null,null),
('Poissons','Calamars cuits',110,18,3,2,null,null,null,null,null,null),
('Poissons','Noix de Saint-Jacques cuites',110,22,3,1,null,null,null,null,null,null),
('Poissons','Surimi',105,8,15,1.5,'bâtonnet','bâtonnets',15,null,null,null),
('Poissons','Poisson pané cuit',210,13,19,9,'bâtonnet','bâtonnets',25,null,null,null),
('Oeufs et laitiers','Jaune d''oeuf',340,16,0.5,30,'jaune','jaunes',17,null,null,null),
('Oeufs et laitiers','Lait écrémé',34,3.4,4.8,0.1,null,null,null,null,null,1.03),
('Oeufs et laitiers','Lait entier',65,3.3,4.7,3.6,null,null,null,null,null,1.03),
('Oeufs et laitiers','Lait sans lactose demi-écrémé',46,3.3,4.8,1.6,null,null,null,null,null,1.03),
('Oeufs et laitiers','Kéfir de lait',55,3.5,4,3,null,null,null,null,null,1.03),
('Oeufs et laitiers','Yaourt nature 0%',40,4.5,5,0.1,'pot','pots',125,null,null,null),
('Oeufs et laitiers','Yaourt aux fruits',95,3.5,14,2.5,'pot','pots',125,null,null,null),
('Oeufs et laitiers','Yaourt grec 0%',55,10,3.5,0,'pot','pots',170,null,null,null),
('Oeufs et laitiers','Skyr à la vanille',75,9.5,8,0.2,'pot','pots',150,null,null,null),
('Oeufs et laitiers','Petit-suisse nature',110,9,3.5,6.5,'petit-suisse','petits-suisses',60,null,null,null),
('Oeufs et laitiers','Crème fraîche épaisse 30%',290,2.4,3,30,null,null,null,5,15,null),
('Oeufs et laitiers','Crème fraîche légère 15%',160,3,4,15,null,null,null,5,15,null),
('Oeufs et laitiers','Crème liquide 30%',290,2.2,3,30,null,null,null,5,15,1.0),
('Oeufs et laitiers','Comté',410,27,0,34,null,null,null,null,null,null),
('Oeufs et laitiers','Gruyère',400,29,0,32,null,null,null,null,null,null),
('Oeufs et laitiers','Cheddar',410,25,1,34,null,null,null,null,null,null),
('Oeufs et laitiers','Parmesan',400,35,0,29,null,null,null,2,6,null),
('Oeufs et laitiers','Feta',265,15,1,22,null,null,null,null,null,null),
('Oeufs et laitiers','Chèvre frais',200,11,2.5,16,null,null,null,null,null,null),
('Oeufs et laitiers','Camembert',280,20,0.5,22,'portion','portions',30,null,null,null),
('Oeufs et laitiers','Raclette (fromage)',340,23,0.5,27,'tranche','tranches',30,null,null,null),
('Oeufs et laitiers','Ricotta',150,9,3.5,11,null,null,null,null,20,null),
('Oeufs et laitiers','Mozzarella allégée',165,20,1.5,9,'boule','boules',125,null,null,null),
('Oeufs et laitiers','Fromage frais à tartiner',240,7,3.5,22,null,null,null,7,20,null),
('Féculents','Riz blanc cru',355,7,79,0.6,null,null,null,null,15,null),
('Féculents','Riz basmati cru',355,8,78,0.8,null,null,null,null,15,null),
('Féculents','Pâtes crues',355,12.5,71,1.5,null,null,null,null,null,null),
('Féculents','Pâtes complètes crues',345,13,64,2.5,null,null,null,null,null,null),
('Féculents','Quinoa cru',365,14,60,6,null,null,null,null,15,null),
('Féculents','Semoule crue',355,12,72,1.5,null,null,null,null,12,null),
('Féculents','Boulgour cuit',85,3,18,0.2,null,null,null,null,null,null),
('Féculents','Boulgour cru',345,12,70,1.5,null,null,null,null,14,null),
('Féculents','Nouilles de riz cuites',110,1.8,25,0.2,null,null,null,null,null,null),
('Féculents','Gnocchis cuits',150,3.5,32,0.5,null,null,null,null,null,null),
('Féculents','Polenta cuite',70,1.5,15,0.3,null,null,null,null,null,null),
('Féculents','Pomme de terre crue',80,2,17,0.1,null,null,null,null,null,null),
('Féculents','Patate douce crue',86,1.6,19,0.1,null,null,null,null,null,null),
('Féculents','Purée de pommes de terre',90,2,13,3.5,null,null,null,null,null,null),
('Féculents','Frites au four',175,3,26,6,null,null,null,null,null,null),
('Féculents','Banane plantain cuite',125,1,30,0.2,null,null,null,null,null,null),
('Féculents','Pain de mie blanc',265,8,48,3.5,'tranche','tranches',25,null,null,null),
('Féculents','Pain aux céréales',260,10,43,5,'tranche','tranches',30,null,null,null),
('Féculents','Pain de seigle',230,7,44,1.5,'tranche','tranches',30,null,null,null),
('Féculents','Pain pita',275,9,55,1.2,'pita','pitas',60,null,null,null),
('Féculents','Pain burger',280,9,49,5,'pain','pains',60,null,null,null),
('Féculents','Tortilla de blé (wrap)',300,8.5,50,7.5,'wrap','wraps',60,null,null,null),
('Féculents','Biscottes',405,11,73,6.5,'biscotte','biscottes',9,null,null,null),
('Féculents','Pain croustillant de seigle',350,10,63,2,'tranche','tranches',10,null,null,null),
('Féculents','Farine de blé',350,10,73,1.2,null,null,null,3,10,null),
('Féculents','Farine d''avoine',380,13.5,60,7,null,null,null,3,10,null),
('Petit-déjeuner','Muesli sans sucres ajoutés',365,10,60,8,null,null,null,null,10,null),
('Petit-déjeuner','Granola',450,9,63,17,null,null,null,null,10,null),
('Petit-déjeuner','Corn flakes',375,7.5,84,1,null,null,null,null,null,null),
('Petit-déjeuner','Crème de riz',365,7,80,1,null,null,null,3,10,null),
('Petit-déjeuner','Son d''avoine',380,17,50,7,null,null,null,3,8,null),
('Petit-déjeuner','Brioche',380,8,52,15,'tranche','tranches',35,null,null,null),
('Petit-déjeuner','Croissant',420,8,45,23,'croissant','croissants',45,null,null,null),
('Petit-déjeuner','Pain au chocolat',420,7,48,22,'pain au chocolat','pains au chocolat',65,null,null,null),
('Petit-déjeuner','Pâte à tartiner chocolat-noisette',540,6,57,31,null,null,null,7,20,null),
('Légumineuses','Lentilles vertes crues',320,24,46,1.5,null,null,null,null,15,null),
('Légumineuses','Lentilles corail crues',340,24,50,1.5,null,null,null,null,15,null),
('Légumineuses','Pois chiches crus',340,20,46,5.5,null,null,null,null,null,null),
('Légumineuses','Haricots blancs cuits',110,7.5,15,0.6,null,null,null,null,null,null),
('Légumineuses','Haricots noirs cuits',130,9,20,0.6,null,null,null,null,null,null),
('Légumineuses','Pois cassés cuits',120,8,18,0.4,null,null,null,null,null,null),
('Légumineuses','Tofu fumé',165,17,2,10,null,null,null,null,null,null),
('Légumineuses','Tempeh',190,19,8,10,null,null,null,null,null,null),
('Légumineuses','Seitan',135,25,5,2,null,null,null,null,null,null),
('Légumineuses','Protéines de soja texturées (sèches)',330,52,14,1.5,null,null,null,null,8,null),
('Légumes','Petits pois cuits',75,5.5,9,0.5,null,null,null,null,null,null),
('Légumes','Maïs doux égoutté',100,3,17,1.5,null,null,null,null,15,null),
('Légumes','Chou-fleur cuit',25,2,2.5,0.3,null,null,null,null,null,null),
('Légumes','Choux de Bruxelles cuits',40,3,5,0.5,null,null,null,null,null,null),
('Légumes','Asperges cuites',25,2.5,2,0.2,null,null,null,null,null,null),
('Légumes','Aubergine cuite',30,1,4.5,0.3,null,null,null,null,null,null),
('Légumes','Poireau cuit',30,1.5,4,0.3,null,null,null,null,null,null),
('Légumes','Carotte cuite',30,0.7,6,0.2,null,null,null,null,null,null),
('Légumes','Betterave cuite',45,1.8,8,0.1,null,null,null,null,null,null),
('Légumes','Courge butternut cuite',35,1,6.5,0.1,null,null,null,null,null,null),
('Légumes','Épinards crus',25,2.9,1.5,0.4,null,null,null,null,null,null),
('Légumes','Roquette',25,2.6,2,0.7,null,null,null,null,null,null),
('Légumes','Chou rouge cru',30,1.4,5,0.2,null,null,null,null,null,null),
('Légumes','Fenouil cru',20,1.2,3,0.2,null,null,null,null,null,null),
('Légumes','Céleri branche',15,0.7,2,0.2,null,null,null,null,null,null),
('Légumes','Radis',15,1,2,0.1,null,null,null,null,null,null),
('Légumes','Tomates cerises',22,1,3.5,0.2,'tomate cerise','tomates cerises',15,null,null,null),
('Légumes','Oignon cru',40,1.2,8,0.2,'oignon','oignons',100,null,null,null),
('Légumes','Ail',130,6,25,0.5,'gousse','gousses',5,null,null,null),
('Légumes','Olives vertes',145,1,0.5,15,'olive','olives',4,null,null,null),
('Fruits','Poire',55,0.4,12,0.1,'poire','poires',160,null,null,null),
('Fruits','Pêche',40,0.8,8.5,0.1,'pêche','pêches',140,null,null,null),
('Fruits','Abricot',45,0.8,9,0.1,'abricot','abricots',40,null,null,null),
('Fruits','Clémentine',47,0.8,10,0.2,'clémentine','clémentines',60,null,null,null),
('Fruits','Mangue',65,0.6,14,0.4,null,null,null,null,null,null),
('Fruits','Raisin',70,0.7,16,0.2,null,null,null,null,null,null),
('Fruits','Cerises',60,1,13,0.3,null,null,null,null,null,null),
('Fruits','Framboises',45,1.2,5,0.6,null,null,null,null,null,null),
('Fruits','Fruits rouges surgelés',40,1,7,0.3,null,null,null,null,null,null),
('Fruits','Melon',35,0.8,7,0.2,null,null,null,null,null,null),
('Fruits','Pastèque',30,0.6,7,0.2,null,null,null,null,null,null),
('Fruits','Grenade',80,1.5,16,1.2,null,null,null,null,null,null),
('Fruits','Compote sans sucres ajoutés',60,0.3,13,0.2,'gourde','gourdes',90,null,null,null),
('Fruits','Abricots secs',250,3,55,0.5,'abricot sec','abricots secs',8,null,null,null),
('Fruits','Figues sèches',250,3,55,1,'figue','figues',20,null,null,null),
('Fruits','Raisins secs',300,3,70,0.5,null,null,null,null,15,null),
('Fruits','Jus de citron',25,0.4,5,0.2,null,null,null,5,15,1.03),
('Matières grasses','Huile de tournesol',900,0,0,100,null,null,null,4,10,0.92),
('Matières grasses','Huile de coco',900,0,0,100,null,null,null,4,10,null),
('Matières grasses','Huile de sésame',900,0,0,100,null,null,null,4,10,0.92),
('Matières grasses','Huile de noix',900,0,0,100,null,null,null,4,10,0.92),
('Matières grasses','Beurre demi-sel',745,0.6,0.7,81,null,null,null,5,15,null),
('Matières grasses','Ghee (beurre clarifié)',900,0,0,99.8,null,null,null,4,12,null),
('Oléagineux','Noisettes',650,15,8,62,null,null,null,null,null,null),
('Oléagineux','Pistaches',600,20.5,17,48,null,null,null,null,null,null),
('Oléagineux','Noix du Brésil',680,14,4,67,'noix','noix',4,null,null,null),
('Oléagineux','Noix de pécan',700,9,4.5,72,null,null,null,null,null,null),
('Oléagineux','Cacahuètes grillées',600,25,13,49,null,null,null,null,null,null),
('Oléagineux','Purée d''amande',630,24,8,55,null,null,null,5,15,null),
('Oléagineux','Purée de noisette',650,15,9,60,null,null,null,5,15,null),
('Oléagineux','Tahini (purée de sésame)',620,18,8,55,null,null,null,5,15,null),
('Oléagineux','Graines de lin',500,20,2,40,null,null,null,4,10,null),
('Oléagineux','Graines de courge',580,30,8,48,null,null,null,4,10,null),
('Oléagineux','Graines de tournesol',600,22,13,51,null,null,null,4,10,null),
('Oléagineux','Graines de sésame',600,18,10,53,null,null,null,3,9,null),
('Oléagineux','Graines de chanvre décortiquées',590,30,5,49,null,null,null,4,10,null),
('Oléagineux','Noix de coco râpée',650,6.5,7,63,null,null,null,2,6,null),
('Compléments','Isolat de whey (poudre)',370,88,2,1,'dose','doses',30,null,8,null),
('Compléments','Isolat de protéine de soja (poudre)',370,85,3,2,'dose','doses',30,null,8,null),
('Compléments','Gainer (poudre)',380,20,72,2,'dose','doses',75,null,null,null),
('Compléments','Boisson protéinée prête à boire',65,8,5,1.2,'bouteille','bouteilles',330,null,null,1.04),
('Compléments','Yaourt protéiné nature',55,10,3.5,0.2,'pot','pots',160,null,null,null),
('Compléments','Pudding protéiné',80,10,7,1.5,'pot','pots',200,null,null,null),
('Boissons','Boisson amande sans sucre',15,0.5,0.3,1.2,null,null,null,null,null,1.01),
('Boissons','Boisson soja nature',40,3.5,2,1.8,null,null,null,null,null,1.02),
('Boissons','Boisson avoine',45,0.5,7,1.4,null,null,null,null,null,1.02),
('Boissons','Lait de coco (conserve)',190,1.8,3,19,null,null,null,null,15,1.0),
('Boissons','Lait chocolaté demi-écrémé',75,3.3,11,1.6,null,null,null,null,null,1.06),
('Boissons','Jus d''orange',45,0.7,10,0.1,null,null,null,null,null,1.04),
('Boissons','Jus de pomme',45,0.1,11,0.1,null,null,null,null,null,1.04),
('Boissons','Soda au cola',42,0,10.6,0,'canette','canettes',345,null,null,1.04),
('Boissons','Soda zéro sucre',0.3,0,0,0,'canette','canettes',330,null,null,1.0),
('Boissons','Boisson isotonique',25,0,6,0,null,null,null,null,null,1.02),
('Boissons','Bière blonde',42,0.4,3,0,'demi','demis',250,null,null,1.01),
('Boissons','Vin rouge',85,0.1,2.5,0,'verre','verres',125,null,null,0.99),
('Sauces et condiments','Mayonnaise',700,1.2,1,77,null,null,null,5,15,null),
('Sauces et condiments','Ketchup',110,1.2,25,0.2,null,null,null,6,17,null),
('Sauces et condiments','Moutarde',150,7,5,11,null,null,null,5,15,null),
('Sauces et condiments','Sauce soja',60,8,6,0.3,null,null,null,6,18,1.15),
('Sauces et condiments','Vinaigrette',450,0.3,3,48,null,null,null,5,15,null),
('Sauces et condiments','Pesto',450,5,6,45,null,null,null,5,15,null),
('Sauces et condiments','Sauce barbecue',150,1,35,0.5,null,null,null,6,17,null),
('Sauces et condiments','Vinaigre balsamique',110,0.5,26,0,null,null,null,5,16,null),
('Sauces et condiments','Sauce bolognaise',100,7,5,6,null,null,null,null,null,null),
('Sauces et condiments','Guacamole',155,2,6,14,null,null,null,5,15,null),
('Sauces et condiments','Sucre',400,0,100,0,null,null,null,5,15,null),
('Sauces et condiments','Sirop d''érable',260,0,67,0.1,null,null,null,7,20,1.32),
('Sauces et condiments','Cacao en poudre non sucré',360,20,14,22,null,null,null,3,7,null),
('Divers','Chocolat au lait',540,7,57,31,'carré','carrés',5,null,null,null),
('Divers','Biscuits petit-beurre',440,7,75,12,'biscuit','biscuits',8,null,null,null),
('Divers','Barre de céréales',400,6,68,11,'barre','barres',25,null,null,null),
('Divers','Chips',540,6,50,34,null,null,null,null,null,null),
('Divers','Glace à la vanille',200,3.5,24,10,'boule','boules',50,null,null,null),
('Divers','Pizza margherita',240,10,30,8.5,'part','parts',125,null,null,null),
('Divers','Quiche lorraine',270,10,18,17,'part','parts',150,null,null,null),
('Divers','Lasagnes à la bolognaise',150,8,13,7,null,null,null,null,null,null),
('Divers','Maki au saumon',150,6,25,2.5,'maki','makis',25,null,null,null)
on conflict (nom) where code_barres is null do nothing;

-- Aliments existants : cuillères et densité
update public.aliments set cac_g = 4, cas_g = 10, densite = 0.92 where nom = 'Huile d''olive' and code_barres is null;
update public.aliments set cac_g = 4, cas_g = 10, densite = 0.92 where nom = 'Huile de colza' and code_barres is null;
update public.aliments set cac_g = 5, cas_g = 15 where nom = 'Beurre de cacahuète' and code_barres is null;
update public.aliments set cac_g = 8, cas_g = 21 where nom = 'Miel' and code_barres is null;
update public.aliments set cac_g = 5, cas_g = 15 where nom = 'Beurre doux' and code_barres is null;
update public.aliments set cac_g = 7, cas_g = 20 where nom = 'Confiture' and code_barres is null;
update public.aliments set cac_g = 5, cas_g = 15 where nom = 'Houmous' and code_barres is null;
update public.aliments set cac_g = 4, cas_g = 10 where nom = 'Graines de chia' and code_barres is null;
update public.aliments set cas_g = 8 where nom = 'Flocons d''avoine' and code_barres is null;
update public.aliments set cas_g = 8 where nom = 'Whey protéine (poudre)' and code_barres is null;
update public.aliments set cas_g = 8 where nom = 'Caséine (poudre)' and code_barres is null;
update public.aliments set cas_g = 8 where nom = 'Protéine végétale pois (poudre)' and code_barres is null;
update public.aliments set cac_g = 4, cas_g = 12 where nom = 'Maltodextrine' and code_barres is null;
update public.aliments set densite = 1.03 where nom = 'Lait demi-écrémé' and code_barres is null;
update public.aliments set densite = 1.03 where nom = 'Blanc d''oeuf' and code_barres is null;
update public.aliments set cas_g = 20 where nom = 'Fromage blanc 0%' and code_barres is null;
update public.aliments set cas_g = 20 where nom = 'Fromage blanc 3%' and code_barres is null;
update public.aliments set cas_g = 15 where nom = 'Sauce tomate nature' and code_barres is null;

-- Les cuillères n'étaient pas de vraies « unités » : les lignes existantes gardent leur affichage en cuillères
update public.repas_aliments set unite = 'cas' where unite is null and aliment_id = (select id from public.aliments where nom = 'Huile d''olive' and code_barres is null);
update public.repas_aliments set unite = 'cas' where unite is null and aliment_id = (select id from public.aliments where nom = 'Huile de colza' and code_barres is null);
update public.repas_aliments set unite = 'cas' where unite is null and aliment_id = (select id from public.aliments where nom = 'Beurre de cacahuète' and code_barres is null);
update public.repas_aliments set unite = 'cac' where unite is null and aliment_id = (select id from public.aliments where nom = 'Miel' and code_barres is null);
update public.aliments set unite_nom = null, unite_pluriel = null, unite_g = null where unite_nom in ('c. à soupe', 'c. à café') and code_barres is null;

-- La copie d'un plan modèle garde l'unité choisie par le coach
create or replace function public.attribuer_plan(m uuid, a uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src plans_nutrition; nouveau uuid; r repas; nr uuid;
begin
  select * into src from plans_nutrition where id = m and athlete_id is null and coach_id = auth.uid();
  if src.id is null then raise exception 'Plan introuvable'; end if;
  if not public.peut_nourrir(a) then raise exception 'Cet athlète ne fait pas partie de tes athlètes pour la nutrition'; end if;
  update plans_nutrition set actif = false where athlete_id = a and actif;
  insert into plans_nutrition(athlete_id, coach_id, nom, description, kcal, proteines, glucides, lipides, modele_id)
  values (a, auth.uid(), src.nom, src.description, src.kcal, src.proteines, src.glucides, src.lipides, src.id) returning id into nouveau;
  for r in select * from repas where plan_id = m order by ordre loop
    insert into repas(plan_id, ordre, nom, note) values (nouveau, r.ordre, r.nom, r.note) returning id into nr;
    insert into repas_aliments(repas_id, ordre, aliment_id, grammes, alternatives, unite)
    select nr, ordre, aliment_id, grammes, alternatives, unite from repas_aliments where repas_id = r.id;
  end loop;
  insert into complements(plan_id, nom, dose, moment) select nouveau, nom, dose, moment from complements where plan_id = m;
  return nouveau;
end $$;
