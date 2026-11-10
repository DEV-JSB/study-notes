# 종이 휨 — 머티리얼 노드는 HLSL 다섯 줄

> ProjectF · 휨 최소판 · 2026-11-02 — 직접 만져 보는 그림은 [paper-bend.html](paper-bend.html)

**점(꼭짓점)마다 "판의 긴 쪽 어디쯤인가(U, 0~1)"를 읽어서, 가운데는 그대로 두고 양 끝만 판 법선 방향으로 들어 올린다. 얼마나 들지는 Niagara가 종이마다 정해서 넘긴다. 바닥에 누우면 0.**

## 노드 = HLSL 한 줄씩

```hlsl
float  u     = TexCoord.x;            // TexCoord → Mask(R)  : 이 점은 긴 쪽 어디쯤? (0~1)
float  c     = (u - 0.5f) * 2.0f;     // ConstantBiasScale   : 가운데 0, 양 끝 ±1
float  shape = c * c;                 // Multiply ①          : 가운데 0, 양 끝 1
float  lift  = shape * Bend * 3.0f;   // Multiply ②③         : 몇 cm 들까
float3 wpo   = lift * VertexNormalWS; // Multiply ④          : 판에 수직 방향으로 그만큼
```

| 점 (Bend = 0.7) | u | c | shape | lift |
|---|---|---|---|---|
| 긴 쪽 끝 | 1.0 | 1.0 | 1.0 | 2.1 cm |
| 1/4 지점 | 0.25 | −0.5 | 0.25 | 0.53 cm |
| 가운데 | 0.5 | 0 | 0 | 0 |

- `(u − 0.5) × 2`는 일차함수, `c²`는 y = x² 포물선
- Bend 부호: **+1이면 ∪, −1이면 ∩, 0이면 평평** (작업자가 BendTest −1로 직접 확인)
- 머티리얼은 이 다섯 줄을 SM_Paper1의 점 35개(5 × 7)에 각각 돌린다 (Epic 공식: 머티리얼 그래프는 HLSL 셰이더로 컴파일됨)

## Niagara → 머티리얼

```
Particle Spawn   Set PARTICLES PaperBend = Random Range Float(-1, 1)      태어날 때 한 번 (Update면 매 프레임 떨림)
Particle Update  Dynamic Material Parameters (맨 아래, PaperSim보다 뒤)
                 Index 0 · Param1 = Particles.PaperBend * (1.0 - Particles.Landed)
M_Paper1         Dynamic Parameter 노드 첫 출력(Param1) → Bend 자리
```

- Dynamic Material Parameters(Niagara) ↔ Dynamic Parameter(머티리얼)가 파티클별 값을 넘기는 표준 짝 (Epic 공식)
- 연결 확인: Niagara 모듈 입력 이름이 `Param0-0 (No material found…)` → 머티리얼 노드를 넣은 뒤 **`Param1`** 로 바뀜

## 함정

- 실제로 쓰는 에셋은 `SM_Paper1` / `M_Paper1` (Mesh Renderer와 Material Slots로 확인). 이름만 보고 `M_Paper`를 고치면 화면이 안 바뀜
- Multiply ①에 선을 하나만 꽂으면 c × 1 = c → 판이 휘지 않고 기울기만 함
- WPO는 겉모습만 바꾼다. 착지·충돌 판정은 그대로 평평한 판
- 머티리얼 미리보기에는 Niagara가 없어서 Dynamic Parameter 기본값(1)으로 휜 채 보임 — 정상
- 이 범위(최소판)에서 안 한 것: 법선 다시 계산(조명), 물결, 착지 순간 서서히 펴기
