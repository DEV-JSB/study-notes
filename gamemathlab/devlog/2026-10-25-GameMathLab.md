# 2026-10-25 개발 일지

> GameMathLab (UE 5.4, C++) · 게임 수학 상설 연습장 · 과정 1(내적·외적·회전) — 레이더 터렛 설계, 회전, 탐지 구, 원뿔 판정

## 오늘 한 것

- **"배웠다"의 기준과 Claude 사용법을 다시 정함** (전역 `CLAUDE.md`에 "성장 점검" 절)
  - 배웠다 = ① Claude 없이 다시 만들기 ② 조건 바꿔 보기 ③ 그림으로 설명하기 ④ 다른 문제에서 알아보기
  - 코드 순서를 **작업자 설계 먼저 → Claude 검토 → 작업자 시도 → 막힌 곳만 완성 코드**로 바꿈 (GameMathLab `CLAUDE.md` §1)
- **레이더 터렛을 직접 설계** — 과정 1의 내적·외적·회전이 한 기능에 다 들어감
  - 터렛은 제자리에서 한 방향으로 계속 회전, 조준 안 함
  - 탐지 = 전방 기준 **원뿔**(높이 포함) + 탐지 거리
  - 들어온 순간 한 발. 쏜 타겟은 기억하고 탐지에서 벗어나면 뺌 (결과적으로 한 바퀴에 한 발)
  - 미사일 = 1초에 N°까지만 꺾는 유도. 미사일 전방 원뿔을 벗어나면 록온을 잃고 영원히 직진
- **`ATurret` (Actor) 제자리 회전** — `AddActorLocalRotation(FRotator(0, RotateSpeedDeg * DeltaTime, 0))` — 커밋 `0714be0`
- **Git LFS가 꺼져 있던 걸 발견해서 고침** — `.gitattributes`가 GitHub 기본값(`* text=auto`)뿐이었음. `.uasset`/`.umap`/바이너리 규칙 추가, `git lfs install`로 훅 설치. 커밋 `0714be0`에서 에셋이 LFS로 들어간 것 확인
- **탐지 구** — C++ 생성자에서 `USphereComponent`를 루트로. 반지름은 `DetectRadius` 하나에서 `OnConstruction`으로 적용
- **충돌 채널 `Target`** — Project Settings → Collision → Object Channels. `BP_Target`(Actor, 큐브)의 Object Type = Target. 구는 Target만 Overlap
- **후보 목록** — `TSet<TWeakObjectPtr<AActor>>`에 들어올 때 Add, 나갈 때 Remove. 화면 로그로 Enter/Exit 확인
- **원뿔 판정 함수 `CheckFireTarget`** — 빼기 → 정규화 → 내적 → cos 기준값과 비교. 세 번 고쳐서 손 계산 검증 통과
- **경계선 그리기 `DrawDetectGizmo`** — 전방(초록), +DetectDeg(빨강), -DetectDeg(파랑)을 `RotateAngleAxis` + `DrawDebugLine`으로

## 최종 코드

### `Turret.h` (멤버 부분)

```cpp
class USphereComponent;

UCLASS()
class GAMEMATHLAB_API ATurret : public AActor
{
	GENERATED_BODY()

public:
	ATurret();
	virtual void OnConstruction(const FTransform& Transform) override;

public:
	UPROPERTY(EditAnywhere, Category = "Turret")
	float DetectRadius = 90.0f;
	UPROPERTY(EditAnywhere, Category = "Turret")
	float DetectDeg = 45.0f;
	float DetectCos;
	UPROPERTY(EditAnywhere, Category = "Turret")
	float RotateSpeedDeg = 90.0f;
	UPROPERTY(VisibleAnywhere, Category = "Turret")
	TObjectPtr<USphereComponent> DetectSphere;

	UFUNCTION()
	void OnSphereTriggerEnter(UPrimitiveComponent* OverlappedComp, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& OverlapInfo);
	UFUNCTION()
	void OnSphereTriggerExit(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);
private:
	TSet<TWeakObjectPtr<AActor>> DetectedActors;
	bool CheckFireTarget(AActor* Actor) const;
	void DrawDetectGizmo() const;
protected:
	virtual void BeginPlay() override;

public:
	virtual void Tick(float DeltaTime) override;
};
```

### `GameMathLab.h` (맨 아래 추가)

```cpp
#define ECC_Target ECC_GameTraceChannel1
```

### `Turret.cpp`

```cpp
ATurret::ATurret()
{
	PrimaryActorTick.bCanEverTick = true;

	DetectSphere = CreateDefaultSubobject<USphereComponent>(TEXT("DetectSphere"));
	SetRootComponent(DetectSphere);
	DetectSphere->InitSphereRadius(10.0f);
	DetectSphere->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	DetectSphere->SetCollisionObjectType(ECC_WorldDynamic);
	DetectSphere->SetCollisionResponseToAllChannels(ECR_Ignore);
	DetectSphere->SetCollisionResponseToChannel(ECC_Target, ECR_Overlap);
	DetectSphere->SetGenerateOverlapEvents(true);
	DetectSphere->SetHiddenInGame(false);
}

void ATurret::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	DetectSphere->InitSphereRadius(DetectRadius);
}

bool ATurret::CheckFireTarget(AActor* Actor) const
{
	FVector TargetPos = Actor->GetActorLocation();
	FVector ForwardVec = GetActorForwardVector();

	FVector TargetDir = TargetPos - GetActorLocation();
	FVector TargetDirNormalized = TargetDir.GetSafeNormal();

	float Result = FVector::DotProduct(TargetDirNormalized, ForwardVec);

	if (DetectCos <= Result)
	{
		return true;
	}
	return false;
}

void ATurret::DrawDetectGizmo() const
{
	const FVector Start = GetActorLocation();
	const FVector Forward = GetActorForwardVector();

	DrawDebugLine(GetWorld(), Start, Start + Forward * DetectRadius, FColor::Green, false, -1.0f, 0, 3.0f);

	const FVector PlusEdge = Forward.RotateAngleAxis(DetectDeg, FVector::UpVector);
	const FVector MinusEdge = Forward.RotateAngleAxis(-DetectDeg, FVector::UpVector);

	DrawDebugLine(GetWorld(), Start, Start + PlusEdge * DetectRadius, FColor::Red, false, -1.f, 0, 2.f);
	DrawDebugLine(GetWorld(), Start, Start + MinusEdge * DetectRadius, FColor::Blue, false, -1.f, 0, 2.f);
}

void ATurret::BeginPlay()
{
	Super::BeginPlay();
	DetectSphere->OnComponentBeginOverlap.AddDynamic(this, &ATurret::OnSphereTriggerEnter);
	DetectSphere->OnComponentEndOverlap.AddDynamic(this, &ATurret::OnSphereTriggerExit);
	DetectCos = FMath::Cos(FMath::DegreesToRadians(DetectDeg));
}

void ATurret::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	AddActorLocalRotation(FRotator(0.f, RotateSpeedDeg * DeltaTime, 0.f));
	DrawDetectGizmo();
}
```

(`OnSphereTriggerEnter`/`Exit`은 화면 로그 + `DetectedActors.Add` / `Remove`)

### `CheckFireTarget` 줄별

| 줄 | 하는 일 | 연산 |
|---|---|---|
| `TargetPos - GetActorLocation()` | 터렛에서 타겟으로 가는 화살표. 순서는 **도착점 − 출발점** | 떼어내기 |
| `GetSafeNormal()` | 길이를 1로. 거리 정보를 떼고 방향만 남김 | 늘이고 줄이기 |
| `DotProduct(..., ForwardVec)` | 길이 1끼리라 결과 = 사이 각도의 cos = 그림자 길이 | 그림자(내적) |
| `DetectCos <= Result` | 그림자가 기준(45°의 그림자 0.707)보다 길면 정면에 더 가까움 = 원뿔 안 | 비교 |
| `Cos(DegreesToRadians(DetectDeg))` | 도 → 라디안(단위만) → cos(그림자 길이). `BeginPlay`에서 계산 | |

### `DrawDetectGizmo` 줄별

| 줄 | 하는 일 | 연산 |
|---|---|---|
| `Start + Forward * DetectRadius` | 전방으로 반지름만큼 간 점 | 늘이고 줄이기 → 이어 붙이기 |
| `Forward.RotateAngleAxis(DetectDeg, FVector::UpVector)` | 전방을 Z축(위)을 경첩으로 +DetectDeg° 돌린 새 벡터. **도(°)** 단위, 길이·원본은 그대로 | 회전 (Yaw) |
| `DrawDebugLine(..., false, -1.f, ...)` | 이번 프레임만 그림 → `Tick`에서 매 프레임 다시 | |

## 티키타카 — 질문하고 배운 것

### Q. 학습을 했다의 기준이 뭘까? Claude에게 끌려다니고 싶지 않아

- 기준은 **Claude 없이, 새 상황에서, 설명하면서 할 수 있나** (①~④). 문법을 아는 건 이 표에 없다
- 완성 코드 + 줄별 설명을 받아 타이핑하는 방식은 ProjectF HLSL과 구조가 같았다. 생각은 Claude가 하고 손만 내가. 설명을 읽으며 이해한 "느낌"과 실제로 할 수 있는 건 다르다 (유창성 착각)
- 그래서 **내가 먼저 설계하고 Claude가 검토**하는 순서로 바꿈. 퀴즈(Claude가 문제를 내는 시험)와는 반대 방향
- 질문 수준: 1 시키기 → 2 증상 던지기 → 3 가설 확인 → 4 판단 검토. 질문이 아래로 내려가는 게 성장

### Q. 터렛 부모는 Actor? Pawn은 플레이어가 조종하는 거 아냐?

- Pawn = **Controller가 조종할 수 있는 것**. PlayerController뿐 아니라 AIController도 조종한다 (적 몬스터도 대부분 Pawn)
- 이 터렛은 조종 없이 혼자 돌고 혼자 판정 → Actor면 충분 (Epic 공식). AI Controller와 Behavior Tree로 터렛을 조종할 거면 Pawn으로 만들기도 함
- 같은 이유로 `BP_Target`도 Pawn → Actor로 바꿈. 부모 클래스는 블루프린트 편집기 **오른쪽 위 `Parent class:`**에 적혀 있다

### Q. 클래스 이름을 Turret으로 쓰면 ATurret이 되나?

- 된다. 파일은 `Turret.h` / `Turret.cpp`, 클래스는 `ATurret` (Epic 공식). 직접 `ATurret`이라고 치면 `AATurret`이 될 수 있다
- 연습장이라 이름이 겹칠 수 있음 (연습 4도 포탑). C++ 클래스 이름은 나중에 바꾸기 번거로우니 처음에 정하기

### Q. MovementComponent 가져와서 돌리면 되는 줄 알았는데 GetMovement가 없네?

- Actor에는 이동 컴포넌트가 없다. `GetCharacterMovement()`는 Character, Yaw Input은 Controller를 돌리는 입력 함수
- 유니티 `transform.Rotate(0, speed * Time.deltaTime, 0)` = 언리얼 `AddActorLocalRotation(FRotator(0, Speed * DeltaTime, 0))`. 위가 Z라서 수평 회전이 **Yaw**
- `FRotator`는 (Pitch, **Yaw**, Roll) 순서. Yaw가 두 번째
- 엔진에 `URotatingMovementComponent`도 있지만, 회전을 직접 해 보려고 안 씀

### Q. 회전은 굳이 디버그로 안 그리고, 큐브 모양을 앞뒤 티 나게 바꿔도 되지?

- 된다. 다만 **모양의 앞 = 액터 +X(전방 벡터)**를 꼭 맞추기. 안 맞으면 눈에 보이는 앞과 실제 판정 기준이 어긋남
- 정사각형 큐브는 90°마다 모양이 같아서 회전 확인용으로 못 씀

### Q. 터렛에 Sphere Collider를 달아서 들어오면 범위 계산에 넣으면 어때?

- 좋은 설계. **넓게 거르고(구, 엔진 Overlap) → 좁게 판정(원뿔, 직접 짠 내적)**. 물리 엔진의 broad phase / narrow phase와 같은 구조 (커뮤니티 표준)
- 덤: 구 반지름 = 탐지 거리라서 거리 판정이 따로 필요 없어짐
- 함정: 구는 바닥·벽·자기 메시까지 다 잡음 → 무엇이 타겟인지 걸러야 함 → **충돌 채널**로 거르기로 결정

### Q. 채널을 만들었는데 Collision Presets 목록에 Target이 안 보여

- Preset(설정 묶음)과 Object Channel(내가 어떤 종류인가)은 다르다. Presets를 **Custom...**으로 바꾸면 나오는 **Object Type** 칸에 Target이 있다
- Collision Responses 표는 "나는 각 종류를 어떻게 대하나". 두 물체의 반응은 **둘 중 약한 쪽** (Ignore < Overlap < Block, Epic 공식)
- 구(WorldDynamic, Target만 Overlap) × 큐브(Target, WorldDynamic에 Block) → Overlap

### Q. CreateDefaultSubobject는 동적으로 생성하는 거야? 유니티에선 콜라이더 붙여 두고 참조했는데

- 실행 중에 만드는 게 아니라 **"이 클래스는 이 부품을 달고 태어난다"는 설계도**. 빌드 후 BP 편집기에 이미 붙어 있는 걸로 보인다. 진짜 동적 생성은 `NewObject` + `RegisterComponent`
- 유니티 = 조립(GameObject + 컴포넌트, 스크립트도 컴포넌트). 언리얼 = 상속(클래스가 종류) + 컴포넌트(부품)
- **로직이 꼭 필요로 하는 부품은 C++ 생성자에서** (빠뜨릴 수 없음, Epic 공식). 모양만 바꾸는 메시는 BP에서
- 유니티 `[RequireComponent(typeof(SphereCollider))]`가 같은 역할. 유니티는 옵션, 언리얼은 기본

### Q. `#define ECC_Target ECC_GameTraceChannel1` 왜 해?

- 직접 만든 채널은 C++에서 이름이 아니라 **번호**(`ECC_GameTraceChannel1`~`18`)로 불린다. 번호는 `Config/DefaultEngine.ini`의 `Name="Target"` 줄에서 확인
- 이름을 붙이는 이유: ① 읽자마자 무슨 채널인지 앎 ② 번호가 바뀌면 한 줄만 고침. **매직 넘버** 없애기 (커뮤니티 표준, Epic 샘플 Lyra도 `#define`)
- `#define`은 컴파일 직전 글자 바꿔치기. 결과 동작은 같다. `constexpr`도 되지만 엔진 헤더가 필요해서 관례상 `#define`

### Q. `TObjectPtr<USphereComponent>`는 단일 객체 아냐?

- 맞다. 구 하나를 가리키는 포인터. `T` 접두사는 "여러 개"가 아니라 **템플릿 클래스**라는 표시 (Epic 공식)
- `TArray` = List, `TSet` = HashSet, `TMap` = Dictionary
- `TObjectPtr`는 UE5에서 UPROPERTY 포인터 권장 방식. 에디터 빌드에서만 부가 기능, 패키징하면 일반 포인터

### Q. 후보 목록은 TArray? TSet?

- 기준은 "같은 타겟이 두 번 들어가면 안 된다" → **TSet**. TArray + `AddUnique`도 되지만 "중복 금지"를 내가 매번 기억해야 함. **의도를 자료구조로 드러내기**
- 안에 넣을 것: 구가 아니라 **구에 들어온 타겟 액터**. 변수를 만들 때 "누구의 무엇이 들어가나"를 한 문장으로
- `AActor*` 그대로면 타겟이 Destroy됐을 때 깨진 주소가 남는다 → **`TWeakObjectPtr<AActor>`** (소유하지 않고 지켜보기만, 사라지면 자동으로 무효). 꺼낼 때 `IsValid()`

### Q. Components/ShpereComponent.h가 없다고 빨간 줄 / UShapeComponent 반환형이 안 맞아

- 오타(`Shpere`). "파일이 없다"는 철자 → 폴더 → 모듈 순서로 의심. 자동완성으로 고르기
- `CreateDefaultSubobject<T>`는 `T*`를 돌려준다. `UShapeComponent`(부모)를 `USphereComponent`(자식) 변수에 그냥 못 넣는다. 유니티 `Collider` → `SphereCollider` 캐스트 없이 넣기와 같은 에러
- 긴 에러는 **첫 줄만**: "왼쪽(변수)에 오른쪽(값)을 넣을 방법이 없다" → 양쪽 자료형 비교

### Q. InitSphereRadius(DetectRadius)가 안 되는 건 생성자라 float이 초기화 전이라서?

- 아니다. `float DetectRadius = 90.0f;`는 생성자 본문보다 **먼저** 들어간다 (C++ 표준)
- 늦게 오는 건 **Details에서 바꾼 값**. 순서: ① C++ 기본값 ② 생성자 ③ Details 값 덮어쓰기. 생성자에서 쓰면 ③을 못 본다
- 해결: `OnConstruction`(③ 다음, 에디터에서 값 바꿀 때마다 다시 불림, Epic 공식)에서 구에 적용. 값은 `DetectRadius` 한 곳에만 (single source of truth)
- `InitSphereRadius`는 생성자 전용, 그 외엔 `SetSphereRadius`(겹침 갱신까지)

### Q. OnConstruction에 override 붙였는데 Cannot resolve symbol 'override'

- C# 습관. C#은 앞(`public override void Foo()`), C++는 **뒤**(`virtual void Foo() override;`)
- 같은 헤더의 `BeginPlay`, `Tick` 선언이 정답 모양. 헷갈리면 엔진이 만들어 준 코드부터 따라 하기
- `.cpp` 정의에는 `virtual`/`override`를 안 붙이고, `Super::OnConstruction(Transform);` 먼저

### Q. UE_LOG 이렇게 쓰는 거 아냐? / 화면에도 띄울 수 있지?

- `TEXT()`는 따옴표 글자만 감싼다. 값은 `UE_LOG`의 다음 인자로: `UE_LOG(LogTemp, Warning, TEXT("Enter(%s)"), *Other->GetName());`
- `FString`을 `%s`에 넣을 땐 앞에 `*` (글자 배열 꺼내기). 입문자 최다 실수
- 화면: `GEngine->AddOnScreenDebugMessage(키, 시간, 색, 문자열)`. 키 -1 = 쌓임(사건 기록), 양수 = 한 줄 덮어쓰기(매 프레임 값). `if (GEngine)` 필수, `#include "Engine/Engine.h"` (IWYU, Epic 공식)
- `UKismetSystemLibrary::PrintString` = 화면 + Output Log 둘 다

### Q. Sphere 범위를 Gizmo처럼 보고 싶은데 코드 심어야 해?

- `USphereComponent`가 자체로 선을 그린다. Play 중엔 `SetHiddenInGame(false)`
- 안 보이면: 반지름이 너무 작다(90 = 90cm) / 뷰포트 G(게임 뷰) / Show 메뉴
- 원뿔은 엔진이 모양을 모름 → `DrawDebugLine` / `DrawDebugCone`으로 직접

### Q. 큐브를 왔다갔다 시켜도 로그가 안 떠 (이게 오늘의 큰 삽질)

- 큐브 Collision은 맞았다 (Ignore = 무시가 맞음)
- 가설 1 "헤더를 Live Coding으로 반영해서" → 로그에 `Live coding failed` ×4, `Function OnSphereTriggerEnter is new or belongs to a modified class` → 풀 빌드로 실험 → **여전히 안 됨, 가설 기각**
- 연결 그림: ① 겹침이 일어나나 → ② 이벤트가 내 함수에 연결됐나 → ③ 함수 내용. ③은 맞음
- 가설 2 "생성자에서 `AddDynamic`" → `BeginPlay`로 한 줄만 옮겨 실험 → **로그 뜸. 원인 확정**
- 단서: `BP_Turret.uasset` 안에 `OnComponentBeginOverlap` 연결 정보가 저장돼 있었음. 생성자에서 한 연결이 BP 에셋에 굳어서, 레벨의 터렛에선 제대로 안 살아남 (정확한 엔진 내부 단계는 확실치 않음). **델리게이트 연결은 `BeginPlay`에서** (커뮤니티 표준)

### Q. 헤더를 건드리면 에디터를 껐다 켜야 하는 거 확실해?

- 확실하지 않았다. Epic 공식 문서: Live Coding의 **재인스턴싱(Reinstancing)**이 켜져 있으면 새 함수·변수 같은 큰 변경도 반영하려고 한다. 꺼져 있으면 예측 불가, 대개 크래시
- "헤더 바꾸면 끄고 빌드"는 **안전한 쪽을 고르는 커뮤니티 경험칙**이지 규칙이 아니다. Claude가 처음에 단정해서 말한 걸 이 질문으로 바로잡음
- 이번 로그 문제의 원인도 Live Coding이 아니었다 (위 Q)

### Q. 나갈 때 함수 매개변수를 어떻게 정해? (F12로 가 봄)

- `DECLARE_DYNAMIC_MULTICAST_SPARSE_DELEGATE_FourParams( FComponentEndOverlapSignature, UPrimitiveComponent, OnComponentEndOverlap, UPrimitiveComponent*, OverlappedComponent, AActor*, OtherActor, UPrimitiveComponent*, OtherComp, int32, OtherBodyIndex)`
- 앞 3개 = 이름표(자료형 이름, 가진 클래스, 변수 이름). 나머지 = (자료형, 이름) 쌍. **`FourParams` = 쌍 4개**. Begin은 `SixParams`라 `bFromSweep`, `SweepResult`가 더 있음
- 자료형과 순서는 정확히, 이름은 자유. 모든 델리게이트에 같은 방법

### Q. Normalize는 방향 벡터로 바꾸는 거, 벡터를 1로 바꾸는 거 아냐?

- **방향은 그대로, 길이만 1**. (300, 400, 0) 길이 500 → (0.6, 0.8, 0) 길이 1. 각 성분을 길이로 나눔 (늘이고 줄이기)
- (타겟 − 터렛) 하나에 정보 두 개: `Size()` = 얼마나 먼가, `GetSafeNormal()` = 어느 쪽인가
- `GetSafeNormal()`은 새 벡터 반환, `Normalize()`는 자기 자신을 바꾸고 bool 반환. Safe = 길이 0이면 (0,0,0)

### Q. 내적 쓰려면 Mathf 같은 거 필요해?

- `FVector::DotProduct(A, B)` (유니티 `Vector3.Dot`). `A.Dot(B)`, `A | B`도 같음. 처음엔 이름 있는 함수로 (취향 · 바꿔도 됨)
- `Mathf` = `FMath` (숫자 하나짜리 계산). 벡터끼리는 `FVector`, 숫자는 `FMath`
- `FMath::Cos`는 라디안. `CoreMinimal.h`에 다 있음

### Q. CheckFireTarget 짜 봤는데 어때? (3번 고침)

- 1차: `TargetPos = GetActorForwardVector()`(위치 아닌 방향), `GetLocation().ForwardVector`(**static 상수 (1,0,0)**이라 터렛이 돌아도 안 돎), `RadiansToDegrees(cos 값)`, `Abs(result) <= 45` → 손 계산하니 정면·옆·뒤 **전부 true**
- 2차: 각도로 바꿔 비교하려 했지만 `Acos`가 빠짐 → 정면 false, 옆 true
- 3차: `DegreesToRadians(45)`까지만(0.785) + 부등호 반대 + 생성자에서 계산 → 셋 다 틀림
- 최종: `DetectCos = Cos(DegreesToRadians(DetectDeg))`을 `BeginPlay`에서, `DetectCos <= Result`
- 배운 방법: **손 계산 검증(desk check)** — 정면 1, 옆 0, 뒤 -1을 넣어 따라가기. 값은 **두세 개** (45°에선 라디안 0.785와 cos 0.707이 우연히 비슷해서 버그가 숨는다)

### Q. 라디안 결과는 Cos를 거쳐야 각도로 변환되는 라디안이 나오는 건가?

- 아니다. 세 가지는 다른 것
  - 도 ↔ 라디안 = 같은 각도의 두 단위 (cm/inch). `FMath::Cos`가 라디안만 받아서 바꿀 뿐 — 고등 수학Ⅰ 호도법
  - cos = 각도를 넣으면 **그림자 길이(비율)**가 나오는 기계. 각도가 아니다 — 중3 삼각비
  - 내적 = 길이 1인 두 화살표 사이의 그림자 길이 = cos θ
- 그래서 **그림자 길이끼리 비교**: 기준 그림자(45° → 0.707)보다 지금 그림자가 길면 정면에 더 가깝다

### Q. 내적을 하면 코사인을 거친 값이 나온다고 이해해도 돼?

- 거의. 정확히는 "길이 1인 두 벡터를 내적하면 **cos θ와 같은 값**이 나온다". 안에서 cos를 부르지 않는다: `Ax*Bx + Ay*By + Az*Bz`
- (1,0,0)·(0.707,0.707,0) = 0.707 = cos 45°. 곱하기와 더하기만으로 각도 정보를 얻는 게 내적의 힘
- 정확한 식 `A·B = |A||B|cos θ`. 길이가 1이 아니면 거리가 곱해져서 기준과 비교 못 함

### Q. 60°면? 50° 떨어진 타겟은?

- cos 60° = **정확히 0.5** (정삼각형 반쪽, 특수각). 50° 떨어진 = 터렛 정면과 타겟 방향 사이가 50°
- cos 50° ≈ 0.64 ≥ 0.5 → **잡힌다**. 그림자가 기준보다 길다 → 정면에 더 가깝다 → 60° 안

### Q. 음수 각도도 똑같이 판정되지? cos 값이니까

- 맞다. cos(-50°) = cos(50°). 내적은 **얼마나 벌어졌나**만 알고 **어느 쪽인지**는 모른다
- 높이를 안 지웠으니 위아래·대각선 50°도 같음 → 정면 축을 둘러싼 **동그란 원뿔**
- 좌우를 알려면 **외적** → 연습 2(맞은 방향), 미사일 꺾기

### Q. 탐지 각도를 Gizmo처럼 그리고 싶어 / Yaw로 Z축 돌려야 하는 거 아냐? / RotateAngleAxis가 뭐야?

- 전방을 ±DetectDeg° 돌린 방향 × DetectRadius로 선 두 개. 벡터 돌리기 = 회전
- 좌우 경계 = **Yaw** = Z(위)가 경첩. 위아래 경계 = **Pitch** = **터렛의 오른쪽**(`GetActorRightVector()`, `FVector::RightVector` 아님)이 경첩
- `V.RotateAngleAxis(AngleDeg, Axis)`: 축을 경첩으로 **도(°)**만큼 돌린 **새 벡터**. 길이·원본 그대로. 매개변수 이름 `AngleDeg`가 단위를 알려 줌. `FQuat(Axis, Rad)`는 라디안
- +가 왼쪽인지 오른쪽인지는 추측하지 않고 **빨강/파랑으로 그려서 확인**한 뒤 이름 짓기
- Tick의 `DrawDebug*`는 Play 중에만 보인다 (유니티 Gizmo는 Edit 모드에도)

## 🚨 오늘 걸린 함정 (습관 경보)

- **헤더 변경을 Live Coding으로** → UPROPERTY가 Details에 안 보임. 헤더(UPROPERTY/UFUNCTION/새 클래스)를 바꾸면 끄고 빌드하는 게 안전 (커뮤니티 표준)
- **`AddDynamic`을 생성자에서** → 컴파일 OK, 함수 OK인데 조용히 안 불림. `BeginPlay`에서 연결
- **생성자에서 Details 값을 씀** (`DetectRadius`, `DetectCos`) → 기본값으로 굳음. `OnConstruction` / `BeginPlay`
- **`FVector::ForwardVector` (static 상수)** → 터렛이 돌아도 (1,0,0). 액터 기준은 `GetActorForwardVector()`
- **단위 섞기** → cos 값과 도(45)를 비교, 라디안을 cos로 착각
- **C# 습관** → `override` 위치, 지역 변수 소문자(`result`, `angle`) — 언리얼은 지역 변수도 PascalCase (Epic 공식)
- **`BP_Target` 부모를 Pawn으로** → 조종할 필요 없는 물체는 Actor
- **`.gitattributes`에 LFS 규칙이 없었음** → 그대로 커밋했으면 에셋이 일반 git에 들어갈 뻔
- **Claude 실수**
  - "헤더 바꾸면 반드시 재시작", "일반 멤버 변수도 반드시 끄고 빌드"라고 단정 → Epic 문서 확인 후 "안전한 선택(커뮤니티 표준)"으로 정정
  - 로그 문제를 처음엔 Live Coding 탓으로 진단 → 가설로만 말해 둔 덕에 실험으로 기각
  - 확인 중에 요청 없이 `git lfs install --local --skip-repo` 실행 → `.git/config`에 전역과 같은 LFS 설정이 들어감 (동작 영향 없음)

## 결정한 것

- **레이더 터렛을 과정 1의 최종 작품 후보로** — 연습 1~4(내적·외적·회전·쿼터니언)가 한 기능에 다 들어감. `CLAUDE.md` 과정 표 갱신은 아직 (취향 · 바꿔도 됨)
- **미사일 = (나) 초당 N°까지만 꺾기** — (가) 즉시 꺾기로 하면 외적이 필요 없어져서 과정 1의 목표(외적 = 경첩 축)가 빠짐. 바꾼 이유가 "Claude가 그래서"가 아니라 "이 연습장의 목적"인지 스스로 확인할 것
- **록온을 한번 잃으면 끝, 이후 직진**. 미사일 첫 방향 = 터렛이 그 순간 바라보던 방향, 수명 `InitialLifeSpan` 5초 (Claude 제안, 취향 · 바꿔도 됨)
- **"들어온 순간"은 쏜 타겟 목록으로 기억** — 유니티 `OnTriggerEnter` / 언리얼 `BeginOverlap`과 같은 원리
- **넓게(구 Overlap) → 좁게(원뿔 내적)**, 타겟 구분은 **충돌 채널 `Target`**
- **탐지망은 C++ 생성자에서** 붙이고, 메시는 BP에서
- **판정은 cos끼리 비교 (A안)**. 각도끼리(`Acos`) 비교도 맞지만, 기준 cos를 한 번만 구하면 되는 쪽으로
- **탐지 거리 값은 `DetectRadius` 하나** → `OnConstruction`에서 구에 적용

## 막힌 것 / 미해결

- **`CheckFireTarget`을 아직 아무도 안 부름** — `Tick`에서 `DetectedActors`를 돌며 `IsValid()` → `.Get()` → 판정, 내적값·안/밖 화면 표시
- **빨강(+DetectDeg) 선이 왼쪽인지 오른쪽인지 확인 전** → 확인 후 `LeftEdge`/`RightEdge`로 이름 바꾸기
- **위아래 경계선 미구현** (경첩 = `GetActorRightVector()`)
- **Play 중 `DetectDeg`를 바꾸면 선은 바뀌는데 판정은 그대로** (`DetectCos`는 `BeginPlay`에서 한 번만)
- 코드 정리: `OnConstruction`의 `InitSphereRadius` → `SetSphereRadius`, `DetectRadius` 기본값 90 → 1000, `DetectCos` 초기값 없음(+ private로), `Turret.cpp`의 쓰지 않는 `#include "Animation/AnimMontage.h"` 제거
- **`.idea/.../workspace.xml`이 레포에 추적 중** — 개인 IDE 상태 파일. `git rm --cached` + `.gitignore`에 `.idea/`
- 맵 위치 `Content/TurretLevel/` vs 규약 `Content/Maps/` — 어느 쪽으로 맞출지 미정
- 오늘 2단계 변경분 미커밋 (`DefaultEngine.ini`의 Target 채널 꼭 포함)

## 다음에 할 것

- **워밍업: `CheckFireTarget`을 보지 않고 빈 함수부터 다시 짜기** → 기준 ① 확인
- `Tick`에서 판정 호출 + 화면 표시 → 원뿔이 큐브를 지나갈 때 "안"으로 바뀌고 내적값이 기준을 넘는지
- 공중 큐브로 높이 판정 확인, 위아래 경계선
- 들어온 순간 한 발 (쏜 타겟 목록) → 미사일

## 성장 점검

- **배웠다의 기준 (원뿔 판정)**: ① 다시 만들기 — 미확인 / ② 바꿔 보기 — ✅ 60°·50° / ③ 설명하기 — 절반 (답은 맞고, 이유 문장은 아직 직접 안 써 봄) / ④ 알아보기 — ✅ 터렛 원뿔 = 미사일 록온 원뿔, `DetectRadius` 교훈을 `DetectCos`에 적용
- **③ 연습 — 그림 없이 한 문장으로**: "타겟 방향과 터렛 정면을 길이 1로 맞춰 내적하면 그림자 길이가 나오고, 그게 기준 각도의 그림자보다 길면 정면에 더 가까우니 원뿔 안이다." (다음 일지에서는 내 말로 다시 써 보기)
- **질문 수준**: 1~2단계 "어떻게 하더라", "안 되네" / 3단계 "반환형이 변수랑 안 맞는 것 같은데", "음수 각도도 cos니까 같지?", "함수 안은 잘못된 거 없다는 거지?" / **Claude를 의심함** — "확실해?"로 Claude 설명의 과장을 잡음
- **잘한 것**: 로그 문제에서 한 번에 하나만 바꿔 가설을 지움. 틀린 가설을 버리고 다음으로
- **아쉬운 것**: 검토에서 짚은 수정(BeginPlay 연결, SetSphereRadius)을 바로 반영하지 않아서 같은 문제를 한 바퀴 더 돔. "코드는 맞았는데 왜 맞는지 모르는" 순간이 있었음

## 습관 체크

- [ ] 새로 만든 것이 연습 폴더에 있다 — 맵이 `Content/Maps/`가 아니라 `Content/TurretLevel/`
- [ ] 네이밍 규약을 지켰다 — 대부분 OK(`DetectRadius`, `RotateSpeedDeg`, `bFromSweep`). 지역 변수 소문자는 고침, `DetectCos` 초기값 없음
- [x] 눈 말고 값으로 확인했다 — 화면 Enter/Exit 로그, 손 계산 검증
- [ ] Output Log에 새로 생긴 경고가 없다 — Live Coding 경고·실패가 쌓여 있었음
- [ ] 저장 후 커밋했다 — 1단계는 커밋(`0714be0`), 2단계는 아직
