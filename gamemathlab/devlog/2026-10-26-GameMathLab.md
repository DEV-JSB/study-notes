# 2026-10-26 개발 일지

> GameMathLab (UE 5.4, C++) · 게임 수학 상설 연습장 · 과정 1(내적·외적·회전) — 레이더 터렛: 원뿔 판정 호출, 미사일 클래스 준비 (감기로 짧게)

## 오늘 한 것

- **어제 2단계 커밋** `c7a852e` — 탐지 구, Target 채널, 후보 목록, 원뿔 판정, 경계선 그리기
- **원뿔 판정을 Tick에서 호출** (어제 미해결 1번) — `DetectedActors`를 돌며 `IsValid` → `CheckFireTarget` → 원뿔 안이면 화면에 `Target Is In Range : 이름`
- **3D 판정 정리** — 구(사거리)와 내적(시야각)이 둘 다 3D라서 높이용 계산을 따로 둘 필요가 없다
- **유니티 프리팹 참조를 언리얼로 옮기는 법** — 블루프린트 + `TSubclassOf`
- **`AMissile`(Actor) C++ 클래스 + `BP_Missile` 생성**, 터렛에 `MissileClass` UPROPERTY를 만들고 BP_Turret에 세팅

## 최종 코드

### `Turret.h` (추가한 부분)

```cpp
class USphereComponent;
class AMissile;

// ... public:
	UPROPERTY(EditAnywhere, Category = "Turret")
	TSubclassOf<AMissile> MissileClass;
```

### `Turret.cpp` — `Tick`

```cpp
void ATurret::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	AddActorLocalRotation(FRotator(0.f, RotateSpeedDeg * DeltaTime, 0.f));

	for (auto DetectedActor : DetectedActors)
	{
		AActor* actor = DetectedActor.Get();
		if (IsValid(actor) && CheckFireTarget(actor))
		{
			if (GEngine)
			{
				GEngine->AddOnScreenDebugMessage(-1, 3.f, FColor::Red, FString::Printf(TEXT("Target Is In Range : %s"), *actor->GetName()));
			}
		}
	}

	DrawDetectGizmo();
}
```

### `Missile.h` / `Missile.cpp`

- 에디터가 만들어 준 빈 틀 그대로 (`AActor` 부모, 생성자, `BeginPlay`, `Tick`)

### 줄별

| 줄 | 하는 일 | 연산 |
|---|---|---|
| `class AMissile;` | **전방 선언**. 헤더에서는 "이런 클래스가 있다"만 알면 된다 (Epic 공식, IWYU) | |
| `TSubclassOf<AMissile> MissileClass` | 미사일 **설계도(클래스)** 를 담는 칸. Details 드롭다운에 AMissile 자식만 뜬다 = 유니티 `[SerializeField] GameObject prefab` | |
| `for (auto DetectedActor : DetectedActors)` | 후보 목록에서 하나씩 꺼냄. 꺼낸 건 `TWeakObjectPtr` (지켜보기만 하는 포인터) | |
| `DetectedActor.Get()` | 지켜보던 액터를 꺼냄. 이미 사라졌으면 `nullptr` | |
| `IsValid(actor) && CheckFireTarget(actor)` | `&&`는 앞이 false면 뒤를 안 부른다. 사라진 액터로 판정 함수를 부를 일이 없다 | |
| `CheckFireTarget(actor)` | 어제 만든 원뿔 판정 | 그림자(내적) |
| `AddOnScreenDebugMessage(-1, 3.f, ...)` | 키 -1 = 부를 때마다 **새 줄**이 3초 동안 남는다 | |

## 티키타카 — 질문하고 배운 것

### Q. 콜라이더 안에 들어온 애들만 시야각 검사하니까, 높이까지 3D로 판단할 때 별도 계산은 필요 없지?

- **맞다.** 두 검사가 각자 3D로 돈다. 둘을 겹치면 탐지 범위는 **아이스크림 콘** 모양
  - 구 = 사거리. 거리 √(x²+y²+z²)라 위·아래·옆 어디든 같은 반지름 (중2 피타고라스를 공간으로)
  - 내적 = 시야각. `TargetDir`이 위치끼리 뺀 3D 벡터라 위·아래·옆 어디든 같은 반폭
- Z가 판정에 영향이 없는 건 아니다. 정규화할 때 높이가 클수록 X 몫이 줄어서 내적값이 작아진다

| 타겟 (X, 0, Z), 모두 구 안 | 내적 (기준 0.707) | 결과 |
|---|---|---|
| (500, 0, 0) | 1.000 | 안 |
| (500, 0, 300) | 0.857 | 안 |
| (300, 0, 500) | 0.514 | 밖 |
| (0, 0, 500) 머리 위 | 0.000 | 밖 |

- **따로 계산이 필요해지는 경우**: 좌우 ±45°, 위아래 ±20°처럼 반폭을 다르게 할 때. 내적은 "얼마나 벌어졌나"만 알고 "어느 쪽으로"는 몰라서 늘 동그란 원뿔이 된다
- 작은 차이: Overlap은 타겟의 **충돌 모양**이 닿으면, 내적은 타겟의 **중심**으로 계산 (Epic 공식). 경계에서 기준점이 살짝 다르다

### Q. 유니티는 프리팹 만들고 직렬화해서 Instantiate하는데, 언리얼은?

| 유니티 | 언리얼 |
|---|---|
| Projectile 프리팹 | C++ `AMissile` 부모의 블루프린트 `BP_Missile` |
| `[SerializeField] GameObject prefab;` | `UPROPERTY(EditAnywhere) TSubclassOf<AMissile> MissileClass;` |
| 인스펙터에 끌어다 놓기 | BP_Turret Details 드롭다운에서 고르기 |

- 유니티 프리팹은 **물건**이라 복제한다. 언리얼 BP는 **설계도(클래스)** 라 그걸로 새로 찍어 낸다. 그래서 `TObjectPtr`(물건 하나)가 아니라 `TSubclassOf`(클래스) (Epic 공식)
- C++에 BP 경로를 박지 않고 Details에서 고른다 (커뮤니티 표준)

### Q. Missile은 C++로 Pawn 부모 기반으로 만들면 되지?

- **Actor.** 미사일을 움직이는 건 Controller가 아니라 미사일 자기 Tick 코드
- 판단 질문 하나: **"Controller가 이걸 빙의(Possess)해서 조종하나?"**

| 대상 | Controller가 조종? | 부모 |
|---|---|---|
| 플레이어 캐릭터 | PlayerController | Pawn(Character) |
| 순찰하는 적 병사 | AIController | Pawn(Character) |
| 레이더 터렛, 유도 미사일, 문, 총알 | 아니오 (자기 코드로 움직임) | Actor |

- 근거: UE 5.4 First Person 템플릿의 총알 클래스도 `AActor` 부모 (Epic 공식)
- Pawn으로 만들어도 움직임이 생기지 않는다. Pawn이 더해 주는 건 빙의·입력·AI Controller
- Pawn이 맞는 미사일: 플레이어가 카메라를 타고 직접 조종하는 미사일
- 어제 터렛에서 같은 판단을 했는데 이번에도 Pawn이 먼저 떠올랐다. 기준이 **"플레이어가 조종하나"** 로 기억돼 있었던 게 원인. AI가 조종하는 적도 Pawn이니까 기준은 **"Controller가 조종하나"**

## 🚨 오늘 걸린 함정 (습관 경보)

- **지역 변수 소문자 `actor`** — 어제 고친 C# 습관(`result`, `angle`)이 다시 나옴. 언리얼은 지역 변수도 PascalCase (Epic 공식). 이름은 `TargetActor`처럼 무엇인지 드러나게
- **Tick에서 키 -1 + 3초 화면 로그** — 원뿔 안에 있는 동안 매 프레임 새 줄이 쌓인다 (60fps면 3초에 180줄). 어제 정리한 규칙: **-1 = 쌓임(사건 한 번), 양수 키 = 한 줄 덮어쓰기(매 프레임 값)** (Epic 공식)
- **Claude 실수**: "콜라이더 안에서만 검사하니 3D로 별도 계산이 필요 없지?"를 "Z는 판정에 상관없지?"로 잘못 읽고 엉뚱한 쪽을 설명함. 작업자가 질문을 다시 풀어 줘서 바로잡음

## 결정한 것

- **미사일 부모 = Actor** (Epic 공식 템플릿과 같음)
- **미사일 BP는 Details의 `MissileClass`로 지정**, C++에 경로를 박지 않음 (커뮤니티 표준)
- **미사일 움직임은 Tick에서 직접** — (나) 초당 N°까지만 꺾기, 외적 연습 (취향 · 바꿔도 됨)
- **높이 별도 계산 없음, 동그란 원뿔 유지** — 위아래·좌우 반폭을 다르게 할 일이 생기면 그때 나눔

## 막힌 것 / 미해결

- **미사일 설계 세 가지를 아직 안 적음**
  - AMissile이 가질 값 (UPROPERTY로 둘 것 / 터렛한테서 받을 것)
  - 터렛이 "지금 막 원뿔에 들어왔다"를 알아내는 방법 (`DetectedActors` + 쏜 타겟 기억 목록)
  - 만드는 순서와 각 단계를 확인할 값
- **쏜 타겟 기억 목록이 아직 없음** — 지금은 원뿔 안에 있는 동안 매 프레임 메시지가 나옴
- 어제에서 넘어온 것
  - 빨강(+DetectDeg) 선이 왼쪽인지 오른쪽인지 확인, 위아래 경계선
  - Play 중 `DetectDeg`를 바꾸면 선만 바뀌고 판정은 그대로 (`DetectCos`는 `BeginPlay`에서 한 번)
  - 코드 정리: `OnConstruction`의 `InitSphereRadius`(생성자 전용), `DetectRadius` 90 → 1000, `DetectCos` 초기값, 쓰지 않는 `#include "Animation/AnimMontage.h"`
  - 맵 위치 `Content/TurretLevel/` vs 규약 `Content/Maps/`
- 오늘 변경분 미커밋 (`Missile.h/.cpp`, `BP_Missile`, `Turret.h/.cpp`, `BP_Turret`)

## 다음에 할 것

- **미사일 설계 세 가지를 먼저 적기** → Claude 검토 → 코드
- 실마리: 직진하는 미사일부터 → 발사(들어온 순간 한 발) → 유도(외적)는 마지막
- 화면 로그를 양수 키로 바꾸고, 공중에 놓은 타겟으로 높이 판정 확인 (머리 위 = 구 안, 원뿔 밖)

## 성장 점검

- **배웠다의 기준**
  - 원뿔 판정: ② 바꿔 보기 ✅ 높이까지 넣었을 때 결과를 스스로 짐작 / ④ 알아보기 ✅ "구가 사거리, 내적이 각도, 둘 다 3D"를 스스로 연결
  - Actor vs Pawn: ① 다시 만들기 ❌ 하루 만에 다시 헷갈림. 기준 문장을 "Controller가 조종하나"로 고쳐 기억하고, 다음 클래스를 만들 때 스스로 먼저 판단해 보기
- **질문 수준**
  - 3단계(가설 확인): "별도 계산이 필요 없지 않나?", "Pawn 부모로 만들면 되지?" — 답을 받기 전에 내 생각을 먼저 말함. 두 번째는 가설이 틀렸지만 질문 모양은 좋음
  - 1단계(어떻게?): "프리팹 + Instantiate는 언리얼에선?" — 처음 보는 엔진 기능이라 자연스러움. 아는 것(유니티)에 빗대서 물어서 답이 1:1 표로 정리됨
  - Claude가 질문을 잘못 읽었을 때 그대로 넘어가지 않고 다시 설명함 → 끌려다니지 않음
- **아쉬운 것**: 미사일 설계(①)를 건너뛰고 클래스 만들기로 먼저 감. 다음엔 설계 세 줄부터

## 습관 체크

- [ ] 새로 만든 것이 연습 폴더에 있다 — `BP_Missile`은 `Content/TurretLevel/` (맵 위치 결정 전)
- [ ] 네이밍 규약을 지켰다 — `AMissile`, `BP_Missile`, `MissileClass` OK / 지역 변수 `actor` 소문자
- [ ] 눈 말고 값으로 확인했다 — 원뿔 판정 화면 로그는 넣음. 높이 판정은 아직
- [ ] Output Log에 새로 생긴 경고가 없다 — 확인 안 함
- [ ] 저장 후 커밋했다 — 어제분은 커밋(`c7a852e`), 오늘분은 아직
