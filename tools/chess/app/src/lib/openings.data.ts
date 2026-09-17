// src/lib/openings.data.ts
//
// The book itself: one line per entry, `ECO|Name|moves in SAN`. Kept
// apart from openings.ts so the code that reads it stays readable and
// this file can be scanned - and checked - as what it is, a table.
//
// Every line is replayed from the initial position by the test suite, so
// an illegal or misspelt move here fails the build rather than quietly
// naming an opening that does not exist.

export const OPENING_BOOK_TEXT = `
A00|Van't Kruijs Opening|e3
A00|Mieses Opening|d3
A00|Anderssen's Opening|a3
A00|Ware Opening|a4
A00|Clemenz Opening|h3
A00|Saragossa Opening|c3
A00|Dunst Opening|Nc3
A00|Grob Attack|g4
A00|Sokolsky Opening|b4
A00|Sokolsky Opening, Outflank Variation|b4 c6
A00|Polish Opening, Symmetrical Variation|b4 b5
A00|Hungarian Opening|g3
A00|Hungarian Opening, Symmetrical Variation|g3 g6
A00|Amar Opening|Nh3
A01|Nimzo-Larsen Attack|b3
A01|Nimzo-Larsen Attack, Modern Variation|b3 d5
A01|Nimzo-Larsen Attack, English Variation|b3 c5
A01|Nimzo-Larsen Attack, Indian Variation|b3 Nf6
A02|Bird Opening|f4
A02|Bird Opening, From Gambit|f4 e5
A02|Bird Opening, From Gambit, Lasker Variation|f4 e5 fxe5 d6 exd6 Bxd6 Nf3 g5
A03|Bird Opening, Dutch Variation|f4 d5
A04|Reti Opening|Nf3
A04|Reti Opening, Lisitsyn Gambit|Nf3 f5 e4
A04|Reti Opening, Sicilian Invitation|Nf3 c5
A05|Reti Opening, King's Indian Attack|Nf3 Nf6 g3
A06|Reti Opening, Nimzo-Larsen Attack|Nf3 d5 b3
A07|King's Indian Attack|Nf3 d5 g3
A08|King's Indian Attack, French Variation|Nf3 d5 g3 c5 Bg2
A09|Reti Opening, Advance Variation|Nf3 d5 c4 d4
A09|Reti Opening, Accepted|Nf3 d5 c4 dxc4
A10|English Opening|c4
A10|English Opening, Adorjan Defence|c4 g6
A10|English Opening, Anglo-Dutch Defence|c4 f5
A11|English Opening, Caro-Kann Defensive System|c4 c6
A12|English Opening, London Defensive System|c4 c6 Nf3 d5 b3
A13|English Opening, Agincourt Defence|c4 e6
A13|English Opening, Romanishin Gambit|c4 e6 Nf3 Nf6 g3 a6
A14|English, Neo-Catalan Declined|c4 e6 Nf3 Nf6 g3 d5 Bg2 Be7
A15|English Opening, Anglo-Indian Defence|c4 Nf6
A16|English Opening, Anglo-Indian, King's Knight Variation|c4 Nf6 Nc3
A16|English Opening, Anglo-Grunfeld Defence|c4 Nf6 Nc3 d5
A17|English Opening, Queens Indian Formation|c4 Nf6 Nc3 e6 Nf3 b6
A18|English, Mikenas-Carls Variation|c4 Nf6 Nc3 e6 e4
A20|English Opening, King's English Variation|c4 e5
A21|King's English, Smyslov Variation|c4 e5 Nc3 d6 g3
A22|King's English, Two Knights Variation|c4 e5 Nc3 Nf6
A22|King's English, Bellon Gambit|c4 e5 Nc3 Nf6 Nf3 e4 Ng5 b5
A23|King's English, Two Knights, Keres Variation|c4 e5 Nc3 Nf6 Nf3 e4 Ng5 c6
A25|English, Closed, Sicilian Reversed|c4 e5 Nc3 Nc6
A26|English, Botvinnik System|c4 e5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6
A28|English, Four Knights Variation|c4 e5 Nc3 Nf6 Nf3 Nc6
A29|English, Four Knights, Kingside Fianchetto|c4 e5 Nc3 Nf6 Nf3 Nc6 g3
A30|English Opening, Symmetrical Variation|c4 c5
A30|English, Symmetrical, Hedgehog Defence|c4 c5 Nf3 Nf6 g3 b6 Bg2 Bb7
A31|English, Symmetrical, Anti-Benoni|c4 c5 Nf3 Nf6 d4
A33|English, Symmetrical, Four Knights|c4 c5 Nf3 Nf6 Nc3 Nc6 d4 cxd4 Nxd4
A34|English, Symmetrical, Three Knights|c4 c5 Nc3 Nf6 g3 d5
A36|English, Symmetrical, Botvinnik System|c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 e4
A40|Queen's Pawn Opening|d4
A40|Englund Gambit|d4 e5
A40|Modern Defence|d4 g6
A40|Polish Defence|d4 b5
A40|Horwitz Defence|d4 e6
A41|Old Indian Defence|d4 d6
A42|Modern Defence, Averbakh System|d4 g6 c4 Bg7 Nc3 d6 e4
A43|Old Benoni Defence|d4 c5
A45|Indian Game|d4 Nf6
A45|Trompowsky Attack|d4 Nf6 Bg5
A45|Trompowsky Attack, Classical Defence|d4 Nf6 Bg5 e6
A46|Indian Game, Knights Variation|d4 Nf6 Nf3
A46|Torre Attack|d4 Nf6 Nf3 e6 Bg5
A47|Queen's Indian Defence, Marienbad System|d4 Nf6 Nf3 b6
A48|London System|d4 Nf6 Nf3 g6 Bf4
A49|Indian Game, Przepiorka Variation|d4 Nf6 Nf3 g6 g3
A50|Indian Game, Queen's Indian Variation|d4 Nf6 c4
A51|Budapest Gambit|d4 Nf6 c4 e5
A52|Budapest Gambit, Adler Variation|d4 Nf6 c4 e5 dxe5 Ng4 Nf3
A53|Old Indian Defence|d4 Nf6 c4 d6
A56|Benoni Defence|d4 Nf6 c4 c5
A57|Benko Gambit|d4 Nf6 c4 c5 d5 b5
A58|Benko Gambit Accepted|d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6
A59|Benko Gambit, Main Line|d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4
A60|Benoni Defence, Modern Variation|d4 Nf6 c4 c5 d5 e6
A61|Benoni Defence, Fianchetto Variation|d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 Nf3 g6 g3
A65|Benoni Defence, King's Pawn Line|d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4
A70|Benoni Defence, Classical|d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3
A80|Dutch Defence|d4 f5
A82|Dutch Defence, Staunton Gambit|d4 f5 e4
A84|Dutch Defence, Classical Variation|d4 f5 c4
A85|Dutch Defence, Queen's Knight Variation|d4 f5 c4 Nf6 Nc3
A87|Dutch Defence, Leningrad Variation|d4 f5 c4 Nf6 g3 g6 Bg2 Bg7 Nf3
A90|Dutch Defence, Stonewall Variation|d4 f5 c4 Nf6 g3 e6 Bg2 d5
A96|Dutch Defence, Classical, Ilyin-Zhenevsky|d4 f5 c4 Nf6 g3 e6 Bg2 Be7 Nf3 O-O O-O d6
B00|King's Pawn Opening|e4
B00|Nimzowitsch Defence|e4 Nc6
B00|Owen Defence|e4 b6
B00|St. George Defence|e4 a6
B00|Fred Defence|e4 f5
B00|Borg Defence|e4 g5
B00|Hippopotamus Defence|e4 Nh6
B01|Scandinavian Defence|e4 d5
B01|Scandinavian Defence, Main Line|e4 d5 exd5 Qxd5 Nc3 Qa5
B01|Scandinavian Defence, Icelandic Gambit|e4 d5 exd5 Nf6 c4 e6
B01|Scandinavian Defence, Modern Variation|e4 d5 exd5 Nf6
B01|Scandinavian Defence, Gubinsky-Melts|e4 d5 exd5 Qxd5 Nc3 Qd6
B02|Alekhine Defence|e4 Nf6
B02|Alekhine Defence, Scandinavian Variation|e4 Nf6 Nc3 d5
B03|Alekhine Defence, Four Pawns Attack|e4 Nf6 e5 Nd5 c4 Nb6 d4 d6 f4
B03|Alekhine Defence, Exchange Variation|e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 exd6
B04|Alekhine Defence, Modern Variation|e4 Nf6 e5 Nd5 d4 d6 Nf3
B05|Alekhine Defence, Modern, Main Line|e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4
B06|Modern Defence|e4 g6
B06|Modern Defence, Robatsch|e4 g6 d4 Bg7
B07|Pirc Defence|e4 d6 d4 Nf6 Nc3
B07|Czech Defence|e4 d6 d4 Nf6 Nc3 c6
B08|Pirc Defence, Classical Variation|e4 d6 d4 Nf6 Nc3 g6 Nf3
B09|Pirc Defence, Austrian Attack|e4 d6 d4 Nf6 Nc3 g6 f4
B10|Caro-Kann Defence|e4 c6
B10|Caro-Kann Defence, Two Knights Attack|e4 c6 Nc3 d5 Nf3
B11|Caro-Kann, Two Knights, 3...Bg4|e4 c6 Nc3 d5 Nf3 Bg4
B12|Caro-Kann Defence, Advance Variation|e4 c6 d4 d5 e5
B12|Caro-Kann, Advance, Short Variation|e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2
B13|Caro-Kann Defence, Exchange Variation|e4 c6 d4 d5 exd5 cxd5
B14|Caro-Kann Defence, Panov Attack|e4 c6 d4 d5 exd5 cxd5 c4
B15|Caro-Kann Defence, Main Line|e4 c6 d4 d5 Nc3
B15|Caro-Kann Defence, Gurgenidze Counterattack|e4 c6 d4 d5 Nc3 g6
B17|Caro-Kann Defence, Steinitz Variation|e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7
B18|Caro-Kann Defence, Classical Variation|e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5
B19|Caro-Kann, Classical, Main Line|e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7
B20|Sicilian Defence|e4 c5
B20|Sicilian Defence, Wing Gambit|e4 c5 b4
B20|Sicilian Defence, Bowdler Attack|e4 c5 Bc4
B21|Sicilian Defence, Smith-Morra Gambit|e4 c5 d4 cxd4 c3
B21|Sicilian Defence, Grand Prix Attack|e4 c5 f4
B22|Sicilian Defence, Alapin Variation|e4 c5 c3
B23|Sicilian Defence, Closed|e4 c5 Nc3
B23|Sicilian Defence, Grand Prix Attack, Schofman|e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bc4
B24|Sicilian Defence, Closed, Fianchetto|e4 c5 Nc3 Nc6 g3
B27|Sicilian Defence, Hyperaccelerated Dragon|e4 c5 Nf3 g6
B27|Sicilian Defence, Katalimov Variation|e4 c5 Nf3 b6
B29|Sicilian Defence, Nimzowitsch Variation|e4 c5 Nf3 Nf6
B30|Sicilian Defence, Old Sicilian|e4 c5 Nf3 Nc6
B31|Sicilian Defence, Rossolimo Variation|e4 c5 Nf3 Nc6 Bb5
B32|Sicilian Defence, Kalashnikov Variation|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5
B32|Sicilian Defence, Lowenthal Variation|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 e5 Nb5 a6
B33|Sicilian Defence, Sveshnikov Variation|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5
B34|Sicilian Defence, Accelerated Dragon|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6
B35|Sicilian, Accelerated Dragon, Modern Bc4|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4
B36|Sicilian Defence, Maroczy Bind|e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4
B40|Sicilian Defence, French Variation|e4 c5 Nf3 e6
B41|Sicilian Defence, Kan Variation|e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6
B42|Sicilian Defence, Kan, Polugaevsky|e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Bc5
B44|Sicilian Defence, Taimanov Variation|e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6
B45|Sicilian Defence, Taimanov, Four Knights|e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Nf6
B50|Sicilian Defence, Modern Variations|e4 c5 Nf3 d6
B51|Sicilian Defence, Moscow Variation|e4 c5 Nf3 d6 Bb5+
B52|Sicilian Defence, Moscow, Main Line|e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7
B54|Sicilian Defence, Open|e4 c5 Nf3 d6 d4 cxd4 Nxd4
B56|Sicilian Defence, Classical Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6
B57|Sicilian Defence, Sozin, Benko Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bc4 Qb6
B60|Sicilian Defence, Richter-Rauzer|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5
B62|Sicilian, Richter-Rauzer, Margate|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5 e6 Qd2 a6
B70|Sicilian Defence, Dragon Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6
B72|Sicilian Dragon, Classical Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 Be2
B76|Sicilian Dragon, Yugoslav Attack|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6
B80|Sicilian Defence, Scheveningen Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6
B81|Sicilian Scheveningen, Keres Attack|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6 g4
B83|Sicilian Scheveningen, Modern|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6 Be2
B90|Sicilian Defence, Najdorf Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6
B90|Sicilian Najdorf, English Attack|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3
B92|Sicilian Najdorf, Opocensky Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2
B94|Sicilian Najdorf, Bg5 Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5
B96|Sicilian Najdorf, Polugaevsky Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 b5
B97|Sicilian Najdorf, Poisoned Pawn|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6
C00|French Defence|e4 e6
C00|French Defence, King's Indian Attack|e4 e6 d3
C01|French Defence, Exchange Variation|e4 e6 d4 d5 exd5 exd5
C02|French Defence, Advance Variation|e4 e6 d4 d5 e5
C02|French Advance, Milner-Barry Gambit|e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3
C03|French Defence, Tarrasch Variation|e4 e6 d4 d5 Nd2
C05|French Tarrasch, Closed Variation|e4 e6 d4 d5 Nd2 Nf6
C07|French Tarrasch, Open Variation|e4 e6 d4 d5 Nd2 c5
C10|French Defence, Paulsen Variation|e4 e6 d4 d5 Nc3
C10|French Defence, Rubinstein Variation|e4 e6 d4 d5 Nc3 dxe4
C11|French Defence, Classical Variation|e4 e6 d4 d5 Nc3 Nf6
C11|French Classical, Steinitz Variation|e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4
C12|French Defence, MacCutcheon Variation|e4 e6 d4 d5 Nc3 Nf6 Bg5 Bb4
C13|French Classical, Alekhine-Chatard Attack|e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 h4
C15|French Defence, Winawer Variation|e4 e6 d4 d5 Nc3 Bb4
C16|French Winawer, Advance Variation|e4 e6 d4 d5 Nc3 Bb4 e5
C18|French Winawer, Main Line|e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3
C20|King's Pawn Game|e4 e5
C20|King's Pawn Game, Alapin Opening|e4 e5 Ne2
C20|Portuguese Opening|e4 e5 Bb5
C21|Danish Gambit|e4 e5 d4 exd4 c3
C21|Centre Game|e4 e5 d4 exd4 Qxd4
C22|Centre Game, Paulsen Attack|e4 e5 d4 exd4 Qxd4 Nc6 Qe3
C23|Bishop's Opening|e4 e5 Bc4
C24|Bishop's Opening, Berlin Defence|e4 e5 Bc4 Nf6
C25|Vienna Game|e4 e5 Nc3
C25|Vienna Game, Hamppe-Allgaier Gambit|e4 e5 Nc3 Nc6 f4 exf4 Nf3 g5 h4 g4 Ng5
C26|Vienna Game, Falkbeer Variation|e4 e5 Nc3 Nf6
C27|Vienna Game, Frankenstein-Dracula Gambit|e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5
C29|Vienna Gambit|e4 e5 Nc3 Nf6 f4
C30|King's Gambit|e4 e5 f4
C30|King's Gambit Declined, Falkbeer Countergambit|e4 e5 f4 d5
C30|King's Gambit Declined, Classical|e4 e5 f4 Bc5
C33|King's Gambit Accepted|e4 e5 f4 exf4
C33|King's Gambit Accepted, Bishop's Gambit|e4 e5 f4 exf4 Bc4
C34|King's Gambit Accepted, Fischer Defence|e4 e5 f4 exf4 Nf3 d6
C35|King's Gambit Accepted, Cunningham Defence|e4 e5 f4 exf4 Nf3 Be7
C36|King's Gambit Accepted, Modern Defence|e4 e5 f4 exf4 Nf3 d5
C37|King's Gambit Accepted, Muzio Gambit|e4 e5 f4 exf4 Nf3 g5 Bc4 g4 O-O
C38|King's Gambit Accepted, Philidor Gambit|e4 e5 f4 exf4 Nf3 g5 Bc4 Bg7
C39|King's Gambit Accepted, Allgaier Gambit|e4 e5 f4 exf4 Nf3 g5 h4 g4 Ng5
C40|King's Knight Opening|e4 e5 Nf3
C40|Latvian Gambit|e4 e5 Nf3 f5
C40|Elephant Gambit|e4 e5 Nf3 d5
C41|Philidor Defence|e4 e5 Nf3 d6
C41|Philidor Defence, Hanham Variation|e4 e5 Nf3 d6 d4 Nd7
C42|Petrov Defence|e4 e5 Nf3 Nf6
C42|Petrov Defence, Classical Attack|e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3
C43|Petrov Defence, Modern Attack|e4 e5 Nf3 Nf6 d4
C44|Ponziani Opening|e4 e5 Nf3 Nc6 c3
C44|Scotch Game|e4 e5 Nf3 Nc6 d4
C44|Tayler Opening|e4 e5 Nf3 Nc6 Be2
C44|Scotch Gambit|e4 e5 Nf3 Nc6 d4 exd4 Bc4
C45|Scotch Game, Main Line|e4 e5 Nf3 Nc6 d4 exd4 Nxd4
C45|Scotch Game, Mieses Variation|e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5
C45|Scotch Game, Classical Variation|e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5
C46|Three Knights Opening|e4 e5 Nf3 Nc6 Nc3
C46|Three Knights, Steinitz Defence|e4 e5 Nf3 Nc6 Nc3 g6
C47|Four Knights Game, Scotch Variation|e4 e5 Nf3 Nc6 Nc3 Nf6 d4
C48|Four Knights Game, Spanish Variation|e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5
C49|Four Knights Game, Double Spanish|e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4
C50|Italian Game|e4 e5 Nf3 Nc6 Bc4
C50|Italian Game, Hungarian Defence|e4 e5 Nf3 Nc6 Bc4 Be7
C50|Giuoco Piano|e4 e5 Nf3 Nc6 Bc4 Bc5
C51|Evans Gambit|e4 e5 Nf3 Nc6 Bc4 Bc5 b4
C52|Evans Gambit Accepted|e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5
C53|Giuoco Piano, Main Line|e4 e5 Nf3 Nc6 Bc4 Bc5 c3
C54|Giuoco Piano, Greco Attack|e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4
C55|Two Knights Defence|e4 e5 Nf3 Nc6 Bc4 Nf6
C55|Italian Game, Max Lange Attack|e4 e5 Nf3 Nc6 Bc4 Nf6 d4 exd4 O-O Bc5 e5
C57|Two Knights Defence, Fried Liver Attack|e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7
C57|Two Knights Defence, Traxler Counterattack|e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5
C58|Two Knights Defence, Polerio Defence|e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5
C60|Ruy Lopez|e4 e5 Nf3 Nc6 Bb5
C60|Ruy Lopez, Cozio Defence|e4 e5 Nf3 Nc6 Bb5 Nge7
C61|Ruy Lopez, Bird Variation|e4 e5 Nf3 Nc6 Bb5 Nd4
C62|Ruy Lopez, Old Steinitz Defence|e4 e5 Nf3 Nc6 Bb5 d6
C63|Ruy Lopez, Schliemann Defence|e4 e5 Nf3 Nc6 Bb5 f5
C64|Ruy Lopez, Classical Defence|e4 e5 Nf3 Nc6 Bb5 Bc5
C65|Ruy Lopez, Berlin Defence|e4 e5 Nf3 Nc6 Bb5 Nf6
C66|Ruy Lopez, Berlin, Closed|e4 e5 Nf3 Nc6 Bb5 Nf6 O-O d6
C67|Ruy Lopez, Berlin Defence, Open|e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4
C68|Ruy Lopez, Exchange Variation|e4 e5 Nf3 Nc6 Bb5 a6 Bxc6
C69|Ruy Lopez, Exchange, Gligoric|e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O
C70|Ruy Lopez, Morphy Defence|e4 e5 Nf3 Nc6 Bb5 a6 Ba4
C70|Ruy Lopez, Norwegian Variation|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 b5 Bb3 Na5
C71|Ruy Lopez, Modern Steinitz Defence|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6
C77|Ruy Lopez, Anderssen Variation|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 d3
C78|Ruy Lopez, Archangelsk Variation|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O b5 Bb3 Bb7
C80|Ruy Lopez, Open Variation|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4
C84|Ruy Lopez, Closed Variation|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7
C88|Ruy Lopez, Closed, Main Line|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3
C89|Ruy Lopez, Marshall Attack|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5
C92|Ruy Lopez, Closed, Flohr System|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3
D00|Queen's Pawn Game|d4 d5
D00|Blackmar-Diemer Gambit|d4 d5 e4
D00|Levitsky Attack|d4 d5 Bg5
D00|Queen's Pawn, Veresov Attack|d4 d5 Nc3 Nf6 Bg5
D01|Richter-Veresov Attack|d4 d5 Nc3
D02|London System|d4 d5 Nf3 Nf6 Bf4
D03|Torre Attack, Queen's Pawn|d4 d5 Nf3 Nf6 Bg5
D04|Colle System|d4 d5 Nf3 Nf6 e3
D05|Colle System, Zukertort Variation|d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3
D06|Queen's Gambit|d4 d5 c4
D06|Queen's Gambit Declined, Marshall Defence|d4 d5 c4 Nf6
D07|Chigorin Defence|d4 d5 c4 Nc6
D08|Albin Countergambit|d4 d5 c4 e5
D09|Albin Countergambit, Fianchetto|d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3
D10|Slav Defence|d4 d5 c4 c6
D11|Slav Defence, Modern Line|d4 d5 c4 c6 Nf3
D12|Slav Defence, Quiet Variation|d4 d5 c4 c6 Nf3 Nf6 e3 Bf5
D15|Slav Defence, Main Line|d4 d5 c4 c6 Nf3 Nf6 Nc3
D16|Slav Defence, Smyslov Variation|d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Na6
D17|Slav Defence, Czech Variation|d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5
D20|Queen's Gambit Accepted|d4 d5 c4 dxc4
D21|Queen's Gambit Accepted, Alekhine Defence|d4 d5 c4 dxc4 Nf3 a6
D23|Queen's Gambit Accepted, Main Line|d4 d5 c4 dxc4 Nf3
D26|Queen's Gambit Accepted, Classical|d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5
D30|Queen's Gambit Declined|d4 d5 c4 e6
D31|Queen's Gambit Declined, Semi-Slav|d4 d5 c4 e6 Nc3 c6
D32|Tarrasch Defence|d4 d5 c4 e6 Nc3 c5
D34|Tarrasch Defence, Normal Variation|d4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3
D35|Queen's Gambit Declined, Exchange Variation|d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5
D37|Queen's Gambit Declined, Three Knights|d4 d5 c4 e6 Nc3 Nf6 Nf3
D38|Queen's Gambit Declined, Ragozin Defence|d4 d5 c4 e6 Nc3 Nf6 Nf3 Bb4
D39|Queen's Gambit Declined, Vienna Variation|d4 d5 c4 e6 Nc3 Nf6 Nf3 dxc4 e4
D43|Semi-Slav Defence|d4 d5 c4 e6 Nc3 Nf6 Nf3 c6
D44|Semi-Slav Defence, Botvinnik Variation|d4 d5 c4 e6 Nc3 Nf6 Nf3 c6 Bg5 dxc4 e4 b5
D45|Semi-Slav Defence, Main Line|d4 d5 c4 e6 Nc3 Nf6 Nf3 c6 e3
D47|Semi-Slav Defence, Meran Variation|d4 d5 c4 e6 Nc3 Nf6 Nf3 c6 e3 Nbd7 Bd3 dxc4 Bxc4 b5
D50|Queen's Gambit Declined, Modern Variation|d4 d5 c4 e6 Nc3 Nf6 Bg5
D51|Queen's Gambit Declined, Cambridge Springs|d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 e3 c6 Nf3 Qa5
D53|Queen's Gambit Declined, Classical|d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7
D55|Queen's Gambit Declined, Anti-Neo-Orthodox|d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6
D58|Queen's Gambit Declined, Tartakower Variation|d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6
D60|Queen's Gambit Declined, Orthodox Defence|d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7
D70|Neo-Grunfeld Defence|d4 Nf6 c4 g6 f3 d5
D74|Neo-Grunfeld, Fianchetto|d4 Nf6 c4 g6 g3 d5 Bg2 Bg7 Nf3 O-O
D80|Grunfeld Defence|d4 Nf6 c4 g6 Nc3 d5
D82|Grunfeld Defence, Bf4 Variation|d4 Nf6 c4 g6 Nc3 d5 Bf4
D85|Grunfeld Defence, Exchange Variation|d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5
D86|Grunfeld, Exchange, Classical|d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Bc4
D87|Grunfeld, Exchange, Spassky Variation|d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Bc4 O-O Ne2 c5
D90|Grunfeld Defence, Three Knights|d4 Nf6 c4 g6 Nc3 d5 Nf3
D94|Grunfeld Defence, Smyslov Variation|d4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 e3 O-O Bd3
E00|Catalan Opening|d4 Nf6 c4 e6 g3
E01|Catalan Opening, Closed|d4 Nf6 c4 e6 g3 d5 Bg2
E04|Catalan Opening, Open Defence|d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3
E06|Catalan Opening, Closed Variation|d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O
E10|Indian Game, Blumenfeld Countergambit|d4 Nf6 c4 e6 Nf3 c5 d5 b5
E11|Bogo-Indian Defence|d4 Nf6 c4 e6 Nf3 Bb4+
E12|Queen's Indian Defence|d4 Nf6 c4 e6 Nf3 b6
E12|Queen's Indian, Petrosian Variation|d4 Nf6 c4 e6 Nf3 b6 a3
E15|Queen's Indian Defence, Fianchetto|d4 Nf6 c4 e6 Nf3 b6 g3
E17|Queen's Indian, Old Main Line|d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7
E20|Nimzo-Indian Defence|d4 Nf6 c4 e6 Nc3 Bb4
E21|Nimzo-Indian Defence, Three Knights|d4 Nf6 c4 e6 Nc3 Bb4 Nf3
E24|Nimzo-Indian Defence, Samisch Variation|d4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3
E26|Nimzo-Indian, Samisch, O'Kelly|d4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3 c5 e3
E32|Nimzo-Indian Defence, Classical Variation|d4 Nf6 c4 e6 Nc3 Bb4 Qc2
E33|Nimzo-Indian, Classical, Milner-Barry|d4 Nf6 c4 e6 Nc3 Bb4 Qc2 Nc6
E40|Nimzo-Indian Defence, Rubinstein Variation|d4 Nf6 c4 e6 Nc3 Bb4 e3
E41|Nimzo-Indian, Rubinstein, Huebner|d4 Nf6 c4 e6 Nc3 Bb4 e3 c5
E43|Nimzo-Indian, Rubinstein, Fischer|d4 Nf6 c4 e6 Nc3 Bb4 e3 b6
E60|King's Indian Defence|d4 Nf6 c4 g6
E61|King's Indian Defence, Smyslov Variation|d4 Nf6 c4 g6 Nc3 Bg7 Nf3 d6 Bg5
E62|King's Indian Defence, Fianchetto Variation|d4 Nf6 c4 g6 Nc3 Bg7 Nf3 d6 g3
E70|King's Indian Defence, Main Line|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6
E73|King's Indian Defence, Averbakh Variation|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Be2 O-O Bg5
E76|King's Indian Defence, Four Pawns Attack|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4
E80|King's Indian Defence, Samisch Variation|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3
E81|King's Indian, Samisch, Normal Defence|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O
E90|King's Indian Defence, Classical Variation|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3
E92|King's Indian, Classical, Petrosian System|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 d5
E97|King's Indian, Mar del Plata Variation|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7
`;
