# 2026-11-03 개발 일지

> GameMathLab (UE 5.4, C++) · 게임 수학 상설 연습장 · 내적 연습: 기둥 주위를 도는 큐브, 기둥의 앞쪽 반이면 빨간 선, 뒤쪽 반이면 파란 선

## 오늘 한 것

- **새 연습 기획** — 큐브가 기둥 주위를 달처럼 돈다. 큐브가 기둥 기준 **앞쪽 반 전체**에 있으면 빨간 선, 뒤쪽 반이면 파란 선. 레이더 터렛이 "원뿔 안이냐(cos 기준값)"를 봤다면 이번엔 "앞이냐 뒤냐(부호)"
- **새 레벨** `Content/OrbitLevel/OrbitLevel` — 터렛이 큐브를 잡아서 미사일을 쏘면 판정 버그와 섞이니 따로 만듦
- **설계를 먼저 함** — 클래스 둘(도는 쪽 `AOrbiter`, 판정하는 기둥 `AOrbitCenter`), 서로를 `TWeakObjectPtr<AActor>`로 가리킴, 판정은 "기둥 앞 벡터 · 기둥→큐브 방향"이 0보다 크면 앞
- **`AOrbitCenter`** — 매 Tick 내적으로 앞/뒤를 판정하고 큐브까지 선을 그림. 처음엔 빼는 순서가 거꾸로라 색과 선이 통째로 뒤집혀 있었음 → 고침
- **`AOrbiter`** — 떼어내기(큐브 − 기둥) → 돌리기(`RotateAngleAxis`, 초당 각도 × `DeltaTime`) → 이어 붙이기(+ 기둥) → `SetActorLocation`. 궤적 방향을 보게 하려고 Offset을 ±90° 돌려 `SetActorRotation`
- **빌드 에러 C1083** — IDE가 몰래 넣은 include 한 줄 때문. 지워서 해결
- **두 번째 Play에서 선이 안 보임** — 기둥 Details의 `Orbiter` 칸이 None. 다시 지정하고 저장해서 해결
- **회고 중 알아봄** — 오늘 판정이 ProjectF의 `faceSign`과 같은 것

## 최종 코드

### `OrbitCenter.h` (추가한 부분)

```cpp
public:
	UPROPERTY(EditAnywhere)
	TWeakObjectPtr<AActor> Orbiter;
```

### `OrbitCenter.cpp`

```cpp
#include "OrbitCenter.h"
#include "Engine/Engine.h"
#include "DrawDebugHelpers.h"

AOrbitCenter::AOrbitCenter()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AOrbitCenter::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (Orbiter.IsValid() == false)
	{
		return;
	}
	const FVector ForwardVector = GetActorForwardVector();
	FVector Direction = Orbiter->GetActorLocation() - GetActorLocation();
	const float Distance = Direction.Length();

	Direction.Normalize();

	const float DotResult = FVector::DotProduct(Direction, ForwardVector);

	const bool bIsTargetAtFront = DotResult > 0.f;

	const FVector MyLocation = GetActorLocation();
	const FColor DebugLineColor = bIsTargetAtFront ? FColor::Red : FColor::Blue;
	DrawDebugLine(GetWorld(), MyLocation, MyLocation + Direction * Distance, DebugLineColor, false, -1.0f, 0, 3.0f);
}
```

### `Orbiter.h` (추가한 부분)

```cpp
public:
	UPROPERTY(EditAnywhere)
	TWeakObjectPtr<AActor> OrbitCenter;
	UPROPERTY(EditAnywhere)
	float RotateSpeed;
```

### `Orbiter.cpp`

```cpp
#include "Orbiter.h"
#include "Engine/Engine.h"

AOrbiter::AOrbiter()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AOrbiter::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!OrbitCenter.IsValid())
	{
		return;
	}

	const FVector OrbitCenterLocation = OrbitCenter->GetActorLocation();
	FVector CenterToOrbiter = GetActorLocation() - OrbitCenterLocation;
	const float Distance = CenterToOrbiter.Size();
	CenterToOrbiter.Normalize();

	FVector RotatedVector = CenterToOrbiter.RotateAngleAxis(RotateSpeed * DeltaTime,FVector::UpVector);

	const FVector NewLocation = (Distance * RotatedVector) + OrbitCenterLocation;
	SetActorLocation(NewLocation);

	FVector OrbiterToCenter = GetActorLocation() - OrbitCenterLocation;
	OrbiterToCenter.Normalize();

	RotatedVector = CenterToOrbiter.RotateAngleAxis(RotateSpeed > 0 ? 90.f : -90.f,FVector::UpVector);

	SetActorRotation(RotatedVector.Rotation());
}
```

### 줄별

| 줄 | 하는 일 | 연산 |
|---|---|---|
| `Orbiter->GetActorLocation() - GetActorLocation()` | 기둥에서 큐브를 향하는 화살표. B − A = A에서 B로 | 떼어내기 |
| `Direction.Normalize()` | 길이 1로. 부호만 볼 때는 없어도 판정은 같음 | 늘이고 줄이기 |
| `DotProduct(Direction, ForwardVector)` | 큐브가 기둥 앞쪽으로 얼마나 있나. 정면 1, 옆 0, 정반대 −1 | 그림자 (내적) |
| `DotResult > 0.f` | 앞쪽 **반 전체**라서 기준값이 0. 터렛 원뿔은 0.71(cos 45°)이었음 | 비교 |
| `bIsTargetAtFront ? Red : Blue` | 판정 결과로 색 고르기 | |
| `GetActorLocation() - OrbitCenterLocation` | 큐브 쪽 Offset. 회전은 원점 기준이라 먼저 기둥에서 떼어냄 | 떼어내기 |
| `RotateAngleAxis(RotateSpeed * DeltaTime, UpVector)` | Z축을 경첩으로 이번 프레임만큼 돌림. **도** 단위 (터렛 원뿔 테두리와 같은 함수) | 회전 |
| `(Distance * RotatedVector) + OrbitCenterLocation` | 방향을 반지름만큼 늘이고 기둥 위치에 다시 붙임 | 늘이기 → 이어 붙이기 |
| `RotateAngleAxis(RotateSpeed > 0 ? 90.f : -90.f, …)` | 반지름 방향을 90° 꺾으면 궤적 방향(접선). 도는 방향에 따라 부호가 바뀜 | 회전 |
| `RotatedVector.Rotation()` | 방향 벡터 → `FRotator` | |

## 티키타카 — 질문하고 배운 것

### 내가 세운 계획

> "앞쪽 반전을 판정하려면 결국 돌고 있는 그 친구를 향하는 벡터, 그리고 특정 Pawn의 전방 벡터와 내적을 한 뒤 음수라면 뒤, 양수라면 앞"

- **맞음.** 터렛은 원뿔이라 0.71, 이번엔 반 전체라 **0**. 같은 내적인데 기준값만 바뀜
- 0과 비교할 때는 정규화 안 해도 판정이 같다. 길이는 항상 양수라 부호를 안 바꾼다. 0.71처럼 cos 값과 비교할 때만 길이 1이 꼭 필요
- 기둥은 Pawn이 아니라 Actor. Pawn은 컨트롤러가 빙의해서 조종하는 것 (Epic 공식). 가리키는 자료형을 `AActor`로 두면 나중에 플레이어를 넣어도 그대로 동작
- 처음엔 확인을 "빨강/파랑 선"으로만 하려 했음 → 선 색은 판정의 **답**이지 검사가 아니다. 기둥은 둥글어서 앞이 안 보이니, 판정이 통째로 뒤집혀도 멀쩡해 보일 수 있다

### Q. 뱅글뱅글은… 기둥 위치를 중심으로, 도는 아이의 위치로부터 회전시킨 곳으로?

- 방향 맞음. 쪼개면 **떼어내기 → 돌리기 → 이어 붙이기**
- 회전 함수는 **항상 원점 (0,0,0)을 중심으로** 돌린다. 월드 위치를 그대로 돌리면 맵 한가운데를 돈다. 그래서 "기둥에서 큐브까지" 화살표만 떼어내서 돌리고 다시 붙인다
- 반지름이 늘 같다 = **원의 정의** (한 점에서 같은 거리에 있는 점들. 중1 평면도형). 회전은 길이를 바꾸지 않으니 Offset을 돌리면 원 위에 머문다
- 다른 길: 각도를 변수로 쌓아 두고 매 프레임 처음부터 위치를 만드는 방식. 지금 방식(조금씩 돌리기)은 아주 오래 돌리면 소수점 오차로 반지름이 조금 변할 수 있음

### Q. 궤적을 바라보며 돌게 하려면 중심을 보고 Yaw 45°… 아니 90°?

- 90° 맞음. **원의 접선은 반지름과 수직** (중3 원의 성질)
- +90°인지 −90°인지는 도는 방향(속도 부호)에 달렸다. `RotateAngleAxis(+90, UpVector)`는 X를 Y 쪽으로 돌림 → 속도가 양수면 +90°가 가는 방향
- 처음엔 반대로 넣어서 뒷걸음질 → 화면에서 보고 부호를 바꿈
- 다른 길: "이번 위치 − 지난 위치"(실제로 움직인 방향)를 보게 하면 부호 고민이 없음. 위 방향과 Offset을 외적해도 접선이 나옴
- 큐브를 돌려도 빨강/파랑은 안 바뀐다. 판정은 기둥 앞 벡터와 두 위치만 쓴다

### Q. TWeakObjectPtr랑 TObjectPtr 차이가 있어? 뭘 써야 해?

| | `TObjectPtr<T>` | `TWeakObjectPtr<T>` |
|---|---|---|
| 하는 일 | 강한 참조. `UPROPERTY`와 같이 쓰면 GC가 안 지움 | 약한 참조. 붙잡지 않음 |
| 상대가 사라지면 | 바로 null이 안 될 수 있음 → `IsValid(Ptr)` | `.Get()`이 nullptr |
| 주로 | 내 부품 (컴포넌트, 내가 소유한 오브젝트) | 남을 가리키기만 할 때 (타겟) |
| 내 코드 | 터렛 `DetectSphere` | 미사일 `TargetActor`, 터렛 `DetectedActors`, 오늘 `Orbiter`/`OrbitCenter` |

- 기준: 이 상대를 **붙잡아야** 하나, **살아 있으면 쓰고 없으면 그만**인가
- UE5는 `UPROPERTY` 멤버에 맨 포인터(`AActor*`) 대신 `TObjectPtr` 권장 (Epic 공식). Shipping에선 맨 포인터와 같음
- 액터는 **월드가 주인**이라 `TObjectPtr`로 잡아도 `Destroy()`하면 사라진다 → 액터를 가리킬 땐 "붙잡기"보다 **확인 방법**(`IsValid` vs `.Get()`)이 차이
- 유니티 대조: `target != null`(Destroy되면 null처럼 보임) ↔ `IsValid`, C# `WeakReference` ↔ `TWeakObjectPtr`
- 오늘은 레벨에 놓고 안 사라지니 둘 다 같은 결과 → 미사일과 같은 모양인 `TWeakObjectPtr`로 (취향 · 바꿔도 됨)
- 함정 두 개는 [언리얼 함정 모음](../../unreal/pitfalls.md)에 카드로

### Q. cross가 FMath 라이브러리에 있는 거 아니었나?

- 아니다. 엔진 헤더(`Math/Vector.h`)에서 확인: `FVector::CrossProduct(A, B)`, `A.Cross(B)`, `A ^ B` (Epic 공식)
- **`FMath` = 숫자 하나** 다루는 함수 (`Sin`, `Cos`, `Acos`, `Lerp`, `Clamp`), **벡터끼리 연산은 `FVector`** (`DotProduct`, `CrossProduct`, `Size`, `GetSafeNormal`)

### Q. 아, 외적이 cross구나

| 한국어 | 영어 | 기호 | 결과 | 내 코드 |
|---|---|---|---|---|
| 내적 | dot product | A · B | 숫자 | 터렛 원뿔, 오늘 앞/뒤 |
| 외적 | cross product | A × B | 벡터 | 미사일 회전 축 |

- 영어 이름은 기호 모양에서: 점(dot) · / 곱하기 표(cross) ×
- 영어로 검색할 때 외적을 **outer product로 번역하면 안 됨**. outer product는 벡터 둘로 행렬을 만드는 다른 연산

### Q. const 키워드는 어디에?

- 한 번 정하고 다시 안 바꾸는 지역 변수의 자료형 앞: `const FVector Start = GetActorLocation();` (터렛에서 이미 쓴 모양)
- 실수로 바꾸면 컴파일러가 막아 주고, 읽는 사람이 따라갈 것이 줄어든다 (커뮤니티 표준)
- `Direction`에는 못 붙임: `Normalize()`는 **자기 자신을** 바꾼다. `GetSafeNormal()`은 자기는 두고 **복사본을** 돌려준다

### Q. 빌드하려니 C1083 에러가 뜨네, 왜일까?

- 에러 두 개 중 **첫 번째만** 본다. `MSB3073 … 코드: 6`은 "빌드 실패로 끝났다"는 결과일 뿐
- `AIBlueprintHelperLibrary.h(15): Error C1083 : Cannot open include file: 'AIBlueprintHelperLibrary.generated.h'` — 찍힌 파일은 엔진 파일이지만 **끌어온 건 바로 위 줄의 `Orbiter.cpp`**
- 원인: `Orbiter.cpp`에 `#include "Runtime/AIModule/Classes/Blueprint/AIBlueprintHelperLibrary.h"`가 있었는데 직접 쓴 줄이 아님 → IDE가 자동 완성 때 넣은 것. AIModule이 `GameMathLab.Build.cs` 의존 목록에 없어서 그 모듈의 `.generated.h` 경로가 안 열림 (Epic 공식: 모듈 의존성은 `Build.cs`에)
- 해결: 안 쓰는 줄이라 지움. 진짜 써야 했다면 `Build.cs`에 `"AIModule"` 추가

### Q. 선이 처음엔 보였는데 두 번째 실행부터 안 보임

- 코드부터 봤더니 `OrbitCenter.cpp`는 첫 실행 때와 **한 글자도 안 바뀜** → 코드 밖(데이터)을 의심
- 이 코드에서 선이 안 그려지는 길은 `Orbiter.IsValid() == false`로 빠지는 것 하나뿐 → 기둥 Details의 `Orbiter` 칸이 **None**이었음
- 흔한 원인: Play 중에 지정함(멈추면 사라짐, Epic 공식) / 지정하고 저장 안 한 채 에디터를 껐다 켬 / 헤더 변수 이름을 바꾼 뒤 다시 지정 안 함
- 디버깅 순서로 남김: ① 무엇이 바뀌었나 ② 코드가 그대로면 데이터를 의심 ③ 그 결과가 나오는 길이 몇 개인가 ④ 그 길을 확인하는 가장 싼 방법

### Q. FaceSign 개념을 쓴 건가?

- **같은 것.** ProjectF `faceSign = step(0.0f, dot(N, FloorN)) * 2.0f - 1.0f;` 와 오늘 `DotResult > 0.f`

| | `faceSign` (11-02) | `bIsTargetAtFront` (오늘) |
|---|---|---|
| 내적하는 두 방향 | 종이 법선 · 바닥 법선 | 기둥 앞 벡터 · 기둥→큐브 |
| 묻는 것 | 앞이냐 뒤냐 (부호) | 앞이냐 뒤냐 (부호) |
| 결과 | +1 / −1 (곱해서 뒤집는 데) | true / false (색 고르는 데) |

- `step(0, x)` = x가 0 이상이면 1, 아니면 0. `* 2 - 1`로 0/1을 −1/+1로 바꿈. Niagara HLSL에서 `if`를 마음껏 못 써서 숫자로 바꾼 것뿐, 판정은 같다
- [11-02 일지](../../projectf/devlog/2026-11-02-ProjectF.md)에 "모양이 바뀌니 못 알아봤다"고 적었던 것. 그림: [경사면에 눕기 (faceSign)](../../projectf/slope-settle.md)

## 🚨 오늘 걸린 함정 (습관 경보)

- **빼는 순서 거꾸로** — `OrbitCenter`에서 `기둥 − 큐브`로 씀. 큐브가 정면 (100,0,0)일 때 내적이 −1 → 파랑. 선도 `MyLocation + Direction * Distance`라 **큐브 반대편으로** 그려져서 "앞으로 뻗은 선은 빨강"처럼 멀쩡해 보였음. 숫자로 따라가서 찾음
- **`Super::Tick`이 `return` 뒤에** — 포인터가 비면 부모 Tick(블루프린트 Event Tick 호출 등)이 안 불림. 맨 첫 줄로 (Epic 공식, 엔진 템플릿 모양)
- **bool 이름** — `IsTargetAtFront` → `bIsTargetAtFront` (Epic 코딩 표준. Unity `isSeen` 습관)
- **이어 붙이기 빠뜨림** — `NewLocation = Distance * RotatedVector`. 기둥이 (500,0,0)이면 큐브가 (100,3,0) 근처 맵 원점으로 순간이동. 기둥을 원점에 놓으면 우연히 맞아서 숨는다
- **괄호로 곱하는 범위가 넓어짐** — `Distance * (RotatedVector + OrbitCenterLocation)` → 100 × (501,0,0) = (50100,0,0). **분배법칙** a × (b + c) = ab + ac (중1). 곱하기는 방향 하나에만 → `(Distance * RotatedVector) + OrbitCenterLocation`
- **바라보는 방향 부호 반대** — 속도가 양수인데 −90° → 뒷걸음질. 화면에서 보고 +90°로
- **C1083: IDE가 몰래 넣은 include** — `Runtime/AIModule/Classes/...` 같은 긴 경로 include는 자동으로 들어간 걸 의심. 커밋 전에 `git diff`로 include 줄 보기
- **Details 참조 None** — 두 번째 Play부터 선이 사라짐. Play 멈춘 상태에서 지정하고 Ctrl+S

## 결정한 것

- **연습마다 레벨 하나**: `Content/OrbitLevel/OrbitLevel` — 기존 `Content/TurretLevel/` 모양을 따름 (취향 · 바꿔도 됨)
- **"앞" = 기둥의 앞 벡터(`GetActorForwardVector()`, 로컬 X) 기준 앞쪽 반 전체** → 기준값 0
- **클래스 둘로 나눔**: 도는 건 `AOrbiter`, 판정은 기둥 `AOrbitCenter`. 서로를 Details에서 지정 (취향 · 바꿔도 됨)
- **상대 포인터는 `TWeakObjectPtr<AActor>`** — 남을 가리키기만 함, Pawn이 아니라 Actor (커뮤니티 표준)
- **확인은 선 색만** — 기둥 앞 방향 화살표와 내적 화면 숫자는 안 넣기로 함. 대신 에디터에서 기둥 로컬 X축(이동 기즈모 빨간 화살표)과 비교
- **궤적 바라보기는 "반지름 방향 ±90°"**, 속도가 양수면 +90°

## 막힌 것 / 미해결

- **아직 확인 안 함**: 빨강/파랑이 기둥 로컬 X축 쪽 반·반대쪽 반과 정확히 맞는지, 오래 돌려도 반지름이 유지되는지
- **큐브가 기둥보다 높거나 낮으면 기울어질 수 있음** — Offset에 Z가 남아서 `.Rotation()`이 Pitch를 만든다. 바라볼 방향은 Z를 0으로 눌러서 써야 함 (확인 전)
- **정리 남음**
  - 안 쓰는 `OrbiterToCenter` (이름도 계산과 반대)
  - `RotatedVector` 하나를 위치용·바라보기용으로 다시 씀 → 이름 나누고 `const`. 바라보기는 지금 돌리기 **전** Offset 기준
  - `RotateSpeed` 기본값 없음(0이라 Details에서 안 넣으면 안 돎), 이름에 단위(`RotateSpeedDeg`), `Category` 없음
  - 정규화 + `Distance`는 없어도 됨 (회전은 길이를 안 바꿈)
  - `OrbitCenter`의 선은 두 위치를 바로 이으면 `Distance`가 필요 없음

## 다음에 할 것

- 기둥을 원점이 아닌 곳, 큐브를 기둥과 다른 높이에 놓고 위 확인 두 개 + 기울기 확인
- 정리 항목 고치기
- 며칠 뒤 빈 파일에서 Claude 없이 궤도 + 앞뒤 판정 다시 만들기 (①)

## 성장 점검

- **배웠다의 기준**
  - ① 다시 만들기: 아직
  - ② 바꿔 보기: 일부 ✅ — 바라보는 방향이 반대인 걸 화면에서 보고 부호를 스스로 고침
  - ③ 설명하기: 아직 안 해 봄
  - ④ 알아보기: ✅ — "FaceSign 개념을 쓴 건가?" 11-02에 못 알아봤던 부호 판정을 모양이 다른 코드에서 먼저 알아봄
- **쪼개기는 작업자가 먼저** — 클래스 둘, 포인터, 내적 → 0과 비교, 확인 방법까지 작업자가 계획. 막힌 곳은 ① 뱅글뱅글의 "어떻게"뿐이었고, 실마리 하나("매 프레임 바뀌는 값") 뒤에 떼어내기 → 돌리기 방향을 스스로 냄. 궤적 바라보기(중심 보고 90°)도 작업자가 먼저 기획
- **질문 수준**
  - 3단계(가설 확인): "cross가 FMath에 있는 거 아니었나", "FaceSign 개념을 쓴 건가"
  - 2단계(증상 던지기): C1083 에러 붙여넣기 + "왤까", "레이가 왜 안 보이지" — 다만 "처음엔 보였는데 두 번째부터"라는 단서를 같이 줘서 좁히기 쉬웠음. 다음엔 "코드는 안 바꿨는데"처럼 **확인한 것**까지 붙여 보기
  - 1단계: const 위치, TObjectPtr/TWeakObjectPtr — 처음 보는 거라 자연스러움
- **한 칸 아래 기초**: 원의 정의 (중1 평면도형), 원의 접선 ⟂ 반지름 (중3 원의 성질), 분배법칙 (중1 정수와 유리수)

## 습관 체크

- [x] 새로 만든 것이 연습 폴더에 있다 — `Content/OrbitLevel/` (규약은 `Content/Maps/`, 기존 모양을 따름)
- [ ] 네이밍 규약을 지켰다 — `bIsTargetAtFront`, `CenterToOrbiter`, `OrbitCenterLocation` OK / `RotateSpeed` 단위 없음, `OrbiterToCenter` 이름이 계산과 반대
- [ ] 눈 말고 값으로 확인했다 — 빼는 순서·괄호 버그는 손 계산으로 찾음. 화면 숫자는 안 넣음
- [ ] Output Log에 새로 생긴 경고가 없다 — 확인 안 함
