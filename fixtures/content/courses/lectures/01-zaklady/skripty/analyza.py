import csv

with open("prodeje.csv") as f:
    print(sum(int(r["prodeje"]) for r in csv.DictReader(f)))
