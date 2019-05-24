type Elem<X> = X extends (infer Y)[] ? Y : X;

interface Array<T> {
  flat(depth: 7): Elem<Elem<Elem<Elem<Elem<Elem<Elem<Elem<this>>>>>>>>[];
  flat(depth: 6): Elem<Elem<Elem<Elem<Elem<Elem<Elem<this>>>>>>>[];
  flat(depth: 5): Elem<Elem<Elem<Elem<Elem<Elem<this>>>>>>[];
  flat(depth: 4): Elem<Elem<Elem<Elem<Elem<this>>>>>[];
  flat(depth: 3): Elem<Elem<Elem<Elem<this>>>>[];
  flat(depth: 2): Elem<Elem<Elem<this>>>[];
  flat(depth?: 1): Elem<Elem<this>>[];
  flat(depth: 0): Elem<this>[];
  flat(depth?: number): any[];
}
