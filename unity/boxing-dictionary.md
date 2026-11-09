# 박싱 / 언박싱 — Dictionary와 struct

> Unity · C# 런타임 · 2026-08-08 — 그림 버전은 [boxing-dictionary.html](boxing-dictionary.html)
>
> 실습 원본: [unity-study / 01.BoxingUnBoxing](https://github.com/DEV-JSB/unity-study/tree/main/Assets/Chapter/01.BoxingUnBoxing)

몇백 개짜리 `List<T>`를 최악 1,000번 돌며 `Find`를 부르는 코드에 "`Dictionary`로 바꾸자"고 리뷰했더니 반문이 왔다.

> Dictionary에 struct를 넣으면 박싱, foreach 돌리면 또 박싱 → GC 때문에 오히려 프레임 드랍 아니냐

아닐 것 같은데 확신이 없어서 **Profiler로 직접 쟀다.** 결론: 반문은 틀렸다. 박싱은 **struct를 키로 쓰면서 `IEquatable<T>`·`GetHashCode()`를 안 만들었을 때**만 생긴다.

## 1. 측정 결과 (직접 측정)

Unity 6000.0.72f1 · 에디터(Mono) · Profiler → CPU Usage → Hierarchy → GC Alloc · 엔트리 1,000개, 케이스마다 프레임당 10회

| 케이스 | 프레임당 | 1회당 | 뜻 |
|---|---|---|---|
| Dictionary 직접 foreach | 0 B | — | 박싱 없음 |
| `IEnumerable<KeyValuePair<K,V>>`로 받아 foreach | 0.6 KB | 약 60 B | 열거자 박싱 1회 |
| struct 키 조회 — 아무것도 구현 안 함 | 0.9 KB | 약 92 B | 박싱 3회 (32 B × 3) |
| struct 키 조회 — `IEquatable<T>`만 | 0.3 KB | 약 32 B | 박싱 1회 |
| struct 키 조회 — `IEquatable<T>` + `GetHashCode()` | *측정 예정* | | 예상 0 |

### 케이스별 코드 ([Code.cs](https://github.com/DEV-JSB/unity-study/blob/main/Assets/Chapter/01.BoxingUnBoxing/Code.cs))

Inspector의 `Test Case`로 고르면 `Update()`가 해당 함수를 매 프레임 부른다. Dictionary는 `Start()`에서 키 1,000개를 `TryAdd`로 넣어 둔다.

#### 기준값 — 단순 박싱 (`SimpleBoxing`) → 10,000번에 195.3 KB (≈ 200,000 B) → 박싱 1번에 20 B

struct 없음. `int` 하나를 `object` 필드에 넣는다.

```csharp
private object _test;

for (int i = 0; i < _iterationCount; ++i)   // _iterationCount = 10000
{
    _test = i;                               // int → object : 박싱 1회
}
```

#### Dictionary 직접 foreach (`DirectForeach`) → 0 B

키 struct: 아무것도 구현 안 함

```csharp
public struct TestStruct
{
    public int X;
    public string TestString;
}

private Dictionary<TestStruct, int> _dict = new Dictionary<TestStruct, int>();

for (int i = 0; i < 10; ++i)
{
    foreach (var test in _dict) { }          // Dictionary<K,V>.Enumerator (struct) 그대로 → 힙 안 씀
}
```

#### 인터페이스로 받아 foreach (`InterfaceForeach`) → 0.6 KB (foreach 1번당 약 60 B)

키 struct: 위와 같은 `TestStruct` (구현 없음). struct 구성은 이 케이스 결과와 상관없다 — 박싱되는 건 키가 아니라 열거자

```csharp
for (int i = 0; i < 10; ++i)
{
    IEnumerable<KeyValuePair<TestStruct, int>> iterator = _dict;
    foreach (var test in iterator) { }       // GetEnumerator()가 IEnumerator로 반환 → 열거자 박싱 1회
}
```

#### struct 키 조회 — 구현 없음 (`StructKeyLookup`) → 0.9 KB (조회 1번당 약 92 B)

키 struct: `Equals(T)` ✗ · `GetHashCode()` ✗

```csharp
public struct TestStruct
{
    public int X;
    public string TestString;
    // 아무것도 없음 → 해시는 ValueType.GetHashCode, 비교는 Equals(object)
}

for (int i = 0; i < 10; ++i)
{
    var testStruct = new TestStruct();
    testStruct.X = i;
    _dict.TryGetValue(testStruct, out int value);   // 해시 1회 + 비교 2회 = 박싱 3회
}
```

#### struct 키 조회 — `IEquatable<T>`만 (`StructKeyLookupEquatable`) → 0.3 KB (조회 1번당 약 32 B)

키 struct: `Equals(T)` ✓ · `GetHashCode()` ✗

```csharp
public struct TestStruct2 : IEquatable<TestStruct2>
{
    public int X;
    public string TestString;
    public bool Equals(TestStruct2 other) => other.X == X;   // 비교 경로 → 0회
    // GetHashCode() 없음 → 해시는 여전히 ValueType.GetHashCode
}

private Dictionary<TestStruct2, int> _dict2 = new Dictionary<TestStruct2, int>();

for (int i = 0; i < 10; ++i)
{
    var testStruct = new TestStruct2();
    testStruct.X = i;
    _dict2.TryGetValue(testStruct, out int value);  // 해시 1회만 남음 = 박싱 1회
}
```

#### struct 키 조회 — `IEquatable<T>` + `GetHashCode()` (`StructKeyLookupEquatable`) → 측정 예정 (예상 0)

키 struct: `Equals(T)` ✓ · `GetHashCode()` ✓ — 위 케이스의 `TestStruct2`에 한 줄을 추가한 것. 저장소의 지금 코드가 이 상태

```csharp
public struct TestStruct2 : IEquatable<TestStruct2>
{
    public int X;
    public string TestString;
    public bool Equals(TestStruct2 other) => other.X == X;   // 비교 경로 → 0회
    public override int GetHashCode() => X;                  // 해시 경로 → 0회 (Equals와 같은 필드 X)
}

// 조회 코드는 위 케이스와 같음
_dict2.TryGetValue(testStruct, out int value);
```

## 2. 박싱 1회는 몇 바이트인가 (직접 측정 + 계산)

**박싱 1번 할 때마다** 힙에 20 B짜리 상자가 새로 하나 생긴다. "5배"도 이 한 번에 대한 말이다.

측정에서 1회 값을 꺼내는 순서:

| 단계 | 계산 | 값 |
|---|---|---|
| ① Profiler가 보여 준 값 (`object o = i;`를 10,000번) | — | 195.3 KB |
| ② 바이트로 (Profiler의 KB는 1,024 B) | 195.3 × 1,024 | ≈ 200,000 B |
| ③ 1번으로 나누기 | 200,000 ÷ 10,000 | **20 B** |

20 B가 어디서 나왔나 (64비트 기준):

| 조각 | 크기 |
|---|---|
| 값 자체 (`int`) | 4 B |
| 객체 헤더 — 타입 포인터 (이 상자가 `int`라는 표시) | 8 B |
| 객체 헤더 — 동기화 블록 (`lock` 등에 쓰는 칸) | 8 B |
| **합계 = 박싱 1번에 새로 생기는 상자** | **20 B** |

- 값은 4 B인데 담는 상자가 20 B → **박싱 1번마다 4 B짜리 값 하나가 20 B를 쓰게 된다 (5배)**. 10,000번이면 상자가 10,000개, 그래서 200,000 B
- 원래의 `int`(스택 4 B)는 그대로 있고, 힙에 **복사본 상자가 추가로** 생기는 것. 이 상자가 GC가 치워야 할 쓰레기가 된다
```
스택 (원래 값)          힙 (박싱 1번에 새로 생기는 상자)

int 4                   ┌──────────────┬──────────────┬─────┐
┌────┐       box        │ 타입 포인터 8 │ 동기화 블록 8 │  4  │  = 20 B
│ 42 │  ──────────────► └──────────────┴──────────────┴─────┘
└────┘                  └────── 헤더 16 (위아래 똑같음) ─────┘

TestStruct 16           ┌──────────────┬──────────────┬─────┬───────┬───────────────┐
┌──────────────┐  box   │ 타입 포인터 8 │ 동기화 블록 8 │ X 4 │ 패딩 4 │ string 참조 8 │  = 32 B
│ X │패딩│ 참조 │ ─────► └──────────────┴──────────────┴─────┴───────┴───────────────┘
└──────────────┘        └────────── 헤더 16 ──────────┘└────── 값 16 (그대로 복사) ─────┘
```

- **헤더 16은 int 줄의 헤더와 똑같은 것**이다. 타입 포인터 8 + 동기화 블록 8. 무엇을 박싱하든(`class`를 `new` 해도) 힙 객체에는 이 16 B가 붙는다 → 박싱 비용 = **값 크기 + 16**
- 실험 struct의 값 16 B = `X` 4 + **패딩 4** (다음 칸인 참조를 8의 배수 위치에 놓으려고 비워 두는 자리, 공식 문서: 필드 정렬) + **string 참조 8** (글자들이 아니라 주소만 복사, 문자열 길이와 무관)
- 그래서 실험 struct는 **박싱 1번에 16 + 16 = 32 B**, 조회 1번에 92 B ≈ 32 B × 3 → 조회 1번마다 박싱 3번

## 3. 자리마다 위험이 다르다

| 자리 | 박싱? | 이유 |
|---|---|---|
| 값(Value) | 거의 안 함 | 담기는 대상이라 해시·비교가 필요 없음. 예외: `ContainsValue()`는 처음부터 훑으며 비교 |
| foreach | 안 함 | 열거자도 struct, `KeyValuePair`도 struct |
| foreach를 **인터페이스로 받아서** | 1회 | struct 열거자가 `IEnumerator`로 박싱. foreach 1번당 1개라 요소 수와 무관 |
| **키(Key)** | 3회 | 아래 두 경로 |

### 키가 박싱되는 두 경로 — 서로 별개

```
TryGetValue(key)
 ├─ ① 어느 버킷? → GetHashCode()
 │     안 만들면 ValueType.GetHashCode() → 박싱 1회
 │     override 하면 → 0회
 └─ ② 같은 키? → EqualityComparer<T>.Default
       IEquatable<T> 없으면 object 비교기 → Equals(object) → 박싱 2회 (인자 + 호출 대상)
       IEquatable<T> 있으면 제네릭 비교기 → 0회
```

- `IEquatable<T>`만 하면 ②만 사라지고 ①은 남는다 → 0.9 KB가 0.3 KB까지만 떨어진 게 증거
- `Add`, `Remove`, `ContainsKey`, 인덱서 — **키를 다루는 모든 연산**이 같은 경로라 자주 터진다
- `Equals`와 `GetHashCode`는 **같은 필드 기준**으로 (공식 문서: 같으면 해시도 같아야 함). 깨지면 넣었는데 못 찾는다

```csharp
public struct SlotKey : IEquatable<SlotKey>
{
    public int X;
    public bool Equals(SlotKey other) => other.X == X;   // ② 비교 경로
    public override int GetHashCode() => X;              // ① 해시 경로 (같은 필드 X)
}
```

- 키 자리의 위험 = **GC(박싱)**, 값 자리의 위험 = **복사 비용**. 성격이 다른 문제

## 4. 박싱은 언제 일어나나 — 한 문장

**값 타입이 참조 타입으로 취급되는 순간.** 그 순간이 네 군데:

| # | 언제 | 예 | 이 실습에서 |
|---|---|---|---|
| 1 | `object`로 넘어갈 때 | `object o = i;`, `string.Format("{0}", i)` | `Equals(object)` |
| 2 | 인터페이스로 취급될 때 | `IEnumerable<KeyValuePair<K,V>> it = dict;` | 인터페이스 foreach |
| 3 | struct가 **override 안 한 상속 메서드**를 부를 때 | `myStruct.GetHashCode()`, `myStruct.ToString()` | `ValueType.GetHashCode()` |
| 4 | `params object[]` | 인자마다 박싱 + 배열 할당 | — |

- 3번은 **매개변수가 없어도** 일어난다 → "매개변수가 `object`인지 보면 된다"로는 못 잡는다
- 3번은 struct만. 클래스는 원래 힙에 있어서 옮길 게 없다

### 안전한 것

- 제네릭 `T` 매개변수: `void Foo<T>(T value)`, `List<int>.Add(int)` — 런타임이 값 타입 전용 코드를 따로 만든다 (공식 문서)
- 값 타입 전용 오버로드: `StringBuilder.Append(int)`

### 확인하는 법

1. 시그니처를 본다 — 인자 자리가 `object`·인터페이스면 박싱, `T`·구체 값 타입이면 안전
2. 오버로드가 여러 개라 컴파일러가 뭘 고를지 모르면 → IL을 보거나, **박싱이 불가능한 형태로 바꿔서 같은 숫자가 나오는지** 잰다 (→ [문자열과 GC](string-gc.md)에서 실제로 씀)

## 5. 결론

- Dictionary에 struct를 넣는 것도, foreach도 박싱을 만들지 않는다
- 문제는 struct **키** + 구현 누락뿐이고, 두 줄이면 0
- 제안한 리팩터링은 그대로 진행됐고 리뷰어도 정정했다
- 내 기준 (취향 · 바꿔도 됨): struct를 키로 쓰면 `IEquatable<T>` + `GetHashCode()`를 **반드시 같이** 만든다

## 더 보기

- [문자열과 GC](string-gc.md) — 2편. "박싱을 피했다 ≠ 할당이 적다"
